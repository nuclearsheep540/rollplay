# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

import logging
import uuid
from typing import Optional

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

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

        # Configure boto3 client with regional endpoint for proper CORS support
        self.client = boto3.client(
            's3',
            region_name=settings.AWS_REGION,
            endpoint_url=f"https://s3.{settings.AWS_REGION}.amazonaws.com",
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            config=Config(signature_version='s3v4')
        )

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
                    'ContentType': content_type
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
            Presigned GET URL for download
        """
        try:
            url = self.client.generate_presigned_url(
                'get_object',
                Params={
                    'Bucket': self.bucket_name,
                    'Key': key
                },
                ExpiresIn=expiry or self.expiry
            )
            logger.info(f"Generated download URL for key: {key}")
            return url
        except ClientError as e:
            logger.error(f"Failed to generate download URL: {e}")
            raise

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
