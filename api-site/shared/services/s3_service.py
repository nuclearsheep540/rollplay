# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
from botocore.signers import CloudFrontSigner
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding

from config.settings import Settings

logger = logging.getLogger(__name__)


class S3Service:
    """
    Service for interacting with AWS S3 (or S3-compatible storage like S3 Express).

    Handles:
    - Generating presigned URLs for client-side uploads
    - Generating presigned URLs for downloads (if bucket is private)
    - Deleting objects from S3
    """

    def __init__(self, settings: Settings):
        self.settings = settings
        self.bucket_name = settings.S3_BUCKET_NAME
        self.expiry = settings.PRESIGNED_URL_EXPIRY

        # Configure boto3 client with regional endpoint for proper CORS support.
        # Always built — needed for uploads and admin ops regardless of CloudFront.
        self.client = boto3.client(
            's3',
            region_name=settings.AWS_REGION,
            endpoint_url=f"https://s3.{settings.AWS_REGION}.amazonaws.com",
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            config=Config(signature_version='s3v4')
        )

        # Optionally build a CloudFront signer for private CDN delivery. When any
        # part is missing/unloadable (e.g. dev without the mounted key), downloads
        # transparently fall back to presigned S3 URLs.
        self.cf_domain = settings.AWS_CFD_S3_URL
        self.cf_key_pair_id = settings.CFD_KEY_PAIR_ID
        self.cf_signer: Optional[CloudFrontSigner] = self._build_cloudfront_signer()

    def _build_cloudfront_signer(self) -> Optional[CloudFrontSigner]:
        """Build a CloudFrontSigner. CloudFront delivery is mandatory: if this returns
        None, generate_download_url raises rather than serving media another way."""
        key_path = self.settings.cfd_private_key_path
        if not (self.cf_domain and self.cf_key_pair_id and key_path):
            logger.error(
                "CloudFront signing is not configured (need AWS_CFD_S3_URL, CFD_KEY_PAIR_ID, "
                "CFD_PRIVATE_KEY_PATH) — media downloads will fail until this is fixed."
            )
            return None
        try:
            with open(key_path, "rb") as key_file:
                private_key = serialization.load_pem_private_key(key_file.read(), password=None)

            def rsa_signer(message: bytes) -> bytes:
                # CloudFront requires RSA-SHA1 (PKCS#1 v1.5) over the policy.
                return private_key.sign(message, padding.PKCS1v15(), hashes.SHA1())

            signer = CloudFrontSigner(self.cf_key_pair_id, rsa_signer)
            logger.info(f"CloudFront signing enabled via {self.cf_domain} (key {self.cf_key_pair_id}).")
            return signer
        except Exception as e:
            logger.error(
                f"CloudFront key at {key_path} could not be loaded ({e}) — media downloads will fail."
            )
            return None

    def generate_upload_url(
        self,
        key: str,
        content_type: str,
        expiry: Optional[int] = None
    ) -> str:
        """
        Generate a presigned URL for uploading a file to S3.

        Args:
            key: The S3 object key (path within bucket)
            content_type: MIME type of the file (e.g., 'image/png')
            expiry: Optional custom expiry in seconds (defaults to settings value)

        Returns:
            Presigned PUT URL for direct upload
        """
        try:
            url = self.client.generate_presigned_url(
                'put_object',
                Params={
                    'Bucket': self.bucket_name,
                    'Key': key,
                    'ContentType': content_type,
                    'CacheControl': 'public, max-age=31536000, immutable',
                },
                ExpiresIn=expiry or self.expiry
            )
            logger.info(f"Generated upload URL for key: {key}")
            return url
        except ClientError as e:
            logger.error(f"Failed to generate upload URL: {e}")
            raise

    def generate_download_url(
        self,
        key: str,
        expiry: Optional[int] = None
    ) -> str:
        """
        Generate a presigned URL for downloading a file from S3.

        Args:
            key: The S3 object key (path within bucket)
            expiry: Optional custom expiry in seconds (defaults to settings value)

        Returns:
            A time-limited CloudFront signed URL.

        Raises:
            RuntimeError: If CloudFront signing is unavailable (misconfigured or the
                signing key failed to load). Media is served exclusively via CloudFront
                — there is no S3 fallback.
        """
        if not self.cf_signer:
            raise RuntimeError(
                f"CloudFront signing unavailable — cannot generate download URL for '{key}'. "
                "Check AWS_CFD_S3_URL, CFD_KEY_PAIR_ID, and the key mounted at CFD_PRIVATE_KEY_PATH."
            )

        ttl = expiry or self.expiry
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=ttl)
        signed_url = self.cf_signer.generate_presigned_url(
            f"https://{self.cf_domain}/{key}",
            date_less_than=expires_at,
        )
        logger.info(f"Generated CloudFront signed URL for key: {key}")
        return signed_url

    def delete_object(self, key: str) -> None:
        """
        Delete an object from S3.

        Args:
            key: The S3 object key to delete

        Raises:
            ClientError: If S3 deletion fails
        """
        try:
            self.client.delete_object(
                Bucket=self.bucket_name,
                Key=key
            )
            logger.info(f"Deleted object: {key}")
        except ClientError as e:
            logger.error(f"Failed to delete object {key}: {e}")
            raise

    def object_exists(self, key: str) -> bool:
        """
        Check if an object exists in S3.

        Args:
            key: The S3 object key to check

        Returns:
            True if object exists, False otherwise
        """
        try:
            self.client.head_object(Bucket=self.bucket_name, Key=key)
            return True
        except ClientError as e:
            if e.response['Error']['Code'] == '404':
                return False
            logger.error(f"Error checking object existence: {e}")
            raise

    @staticmethod
    def generate_key(user_id: str, filename: str, asset_type: str = "map") -> str:
        """
        Generate a unique S3 key for an asset.

        Pattern: {asset_type}/{user_id}/{uuid}_{filename}

        Args:
            user_id: The uploading user's ID
            filename: Original filename
            asset_type: Type of asset (map, audio, image)

        Returns:
            Unique S3 key
        """
        unique_id = uuid.uuid4().hex[:8]
        # Sanitize filename to be URL-safe
        safe_filename = "".join(c for c in filename if c.isalnum() or c in ".-_")
        return f"{asset_type}/{user_id}/{unique_id}_{safe_filename}"

# Dependency injection helper
_s3_service: Optional[S3Service] = None


def get_s3_service() -> S3Service:
    """
    Get the S3 service singleton.

    Creates the service on first call, reuses on subsequent calls.
    """
    global _s3_service
    if _s3_service is None:
        settings = Settings()
        _s3_service = S3Service(settings)
    return _s3_service
