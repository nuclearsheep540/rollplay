"""
S3 Service for Rollplay Site API
Handles S3 operations for site assets and media files
"""

import os
import logging
from typing import List, Dict, Optional
from datetime import datetime

try:
    import boto3
    from botocore.exceptions import NoCredentialsError, ClientError
    from dotenv import load_dotenv
except ImportError as e:
    logging.error(f"Failed to import required S3 dependencies: {e}")
    boto3 = None

# Load environment variables
load_dotenv()

class S3SiteService:
    def __init__(self):
        """Initialize S3 client for site assets"""
        self.bucket_name = os.getenv('S3_BUCKET_NAME', 'rollplay-site-assets')
        self.region = os.getenv('AWS_REGION', 'us-west-2')
        self.presigned_url_expiry = int(os.getenv('PRESIGNED_URL_EXPIRY', '3600'))  # 1 hour default
        
        # Log configuration
        logging.info("🔧 S3SiteService Configuration:")
        logging.info(f"   Bucket: {self.bucket_name}")
        logging.info(f"   Region: {self.region}")
        logging.info(f"   Expiry: {self.presigned_url_expiry}s")
        
        # Get AWS credentials
        aws_access_key_id = os.getenv('AWS_ACCESS_KEY_ID')
        aws_secret_access_key = os.getenv('AWS_SECRET_ACCESS_KEY')
        aws_session_token = os.getenv('AWS_SESSION_TOKEN')
        
        # Initialize S3 client
        try:
            if aws_access_key_id and aws_secret_access_key:
                client_kwargs = {
                    'service_name': 's3',
                    'region_name': self.region,
                    'aws_access_key_id': aws_access_key_id,
                    'aws_secret_access_key': aws_secret_access_key
                }
                
                if aws_session_token:
                    client_kwargs['aws_session_token'] = aws_session_token
                    logging.info("Using temporary AWS credentials")
                else:
                    logging.info("Using AWS access key credentials")
                
                self.s3_client = boto3.client(**client_kwargs)
            else:
                logging.info("Using default AWS credential chain")
                self.s3_client = boto3.client('s3', region_name=self.region)
            
            logging.info(f"✅ S3 client initialized successfully!")
            
        except NoCredentialsError:
            logging.error("❌ AWS credentials not found!")
            self.s3_client = None
        except Exception as e:
            logging.error(f"❌ Failed to initialize S3 client: {str(e)}")
            self.s3_client = None
    
    def list_site_assets(self, asset_type: str = None) -> Dict[str, any]:
        """
        List site assets from S3 bucket
        
        Args:
            asset_type: Optional filter for asset type ('images', 'documents', 'media')
        
        Returns:
            Dictionary with categorized assets
        """
        if not self.s3_client:
            return {'assets': [], 'error': 'S3 client not configured'}
        
        try:
            response = self.s3_client.list_objects_v2(Bucket=self.bucket_name)
            
            images = []
            documents = []
            media_files = []
            
            if 'Contents' in response:
                for obj in response['Contents']:
                    key = obj['Key']
                    size = obj['Size']
                    last_modified = obj['LastModified'].isoformat()
                    
                    # Skip directories and hidden files
                    if key.endswith('/') or key.startswith('.'):
                        continue
                    
                    # Categorize by file extension
                    file_ext = key.lower().split('.')[-1] if '.' in key else ''
                    
                    if file_ext in ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg']:
                        images.append({
                            'id': key,
                            'name': os.path.basename(key),
                            'key': key,
                            'size': size,
                            'last_modified': last_modified,
                            'type': 'image',
                            'extension': file_ext
                        })
                    elif file_ext in ['pdf', 'doc', 'docx', 'txt', 'md']:
                        documents.append({
                            'id': key,
                            'name': os.path.basename(key),
                            'key': key,
                            'size': size,
                            'last_modified': last_modified,
                            'type': 'document',
                            'extension': file_ext
                        })
                    elif file_ext in ['mp4', 'mov', 'avi', 'mkv', 'webm', 'mp3', 'wav', 'm4a']:
                        media_files.append({
                            'id': key,
                            'name': os.path.basename(key),
                            'key': key,
                            'size': size,
                            'last_modified': last_modified,
                            'type': 'media',
                            'extension': file_ext
                        })
            
            # Sort by last modified (newest first)
            images.sort(key=lambda x: x['last_modified'], reverse=True)
            documents.sort(key=lambda x: x['last_modified'], reverse=True)
            media_files.sort(key=lambda x: x['last_modified'], reverse=True)
            
            result = {
                'images': images,
                'documents': documents,
                'media': media_files,
                'bucket': self.bucket_name,
                'total_objects': len(images) + len(documents) + len(media_files)
            }
            
            # Filter by asset type if specified
            if asset_type:
                if asset_type in result:
                    return {asset_type: result[asset_type]}
                else:
                    return {asset_type: []}
            
            return result
            
        except ClientError as e:
            error_code = e.response['Error']['Code']
            error_message = e.response['Error']['Message']
            logging.error(f"S3 ClientError: {error_code} - {error_message}")
            return {
                'assets': [],
                'error': f"S3 Error: {error_code} - {error_message}"
            }
        except Exception as e:
            logging.error(f"Unexpected error listing S3 objects: {str(e)}")
            return {
                'assets': [],
                'error': f"Unexpected error: {str(e)}"
            }
    
    def generate_presigned_url(self, object_key: str, expiry: Optional[int] = None) -> Optional[str]:
        """
        Generate a presigned URL for a specific S3 object
        
        Args:
            object_key: S3 object key (file path)
            expiry: URL expiry time in seconds (optional)
        
        Returns:
            Presigned URL string or None if error
        """
        if not self.s3_client:
            logging.error("S3 client not configured")
            return None
        
        expiry = expiry or self.presigned_url_expiry
        
        try:
            presigned_url = self.s3_client.generate_presigned_url(
                'get_object',
                Params={
                    'Bucket': self.bucket_name,
                    'Key': object_key
                },
                ExpiresIn=expiry
            )
            
            logging.info(f"Generated presigned URL for {object_key} (expires in {expiry}s)")
            return presigned_url
            
        except ClientError as e:
            error_code = e.response['Error']['Code']
            error_message = e.response['Error']['Message']
            logging.error(f"Failed to generate presigned URL for {object_key}: {error_code} - {error_message}")
            return None
        except Exception as e:
            logging.error(f"Unexpected error generating presigned URL: {str(e)}")
            return None
    
    def get_asset_with_presigned_url(self, object_key: str) -> Optional[Dict]:
        """
        Get a specific asset with its presigned URL
        """
        if not self.s3_client:
            return None
        
        try:
            # Get object metadata
            response = self.s3_client.head_object(Bucket=self.bucket_name, Key=object_key)
            
            # Generate presigned URL
            presigned_url = self.generate_presigned_url(object_key)
            
            if not presigned_url:
                return None
            
            return {
                'key': object_key,
                'name': os.path.basename(object_key),
                'size': response['ContentLength'],
                'last_modified': response['LastModified'].isoformat(),
                'content_type': response.get('ContentType', 'application/octet-stream'),
                'presigned_url': presigned_url,
                'url_expires_in': self.presigned_url_expiry
            }
            
        except ClientError as e:
            logging.error(f"Failed to get asset {object_key}: {e}")
            return None
    
    def get_assets_with_presigned_urls(self, asset_type: str = None) -> Dict[str, any]:
        """
        Get all assets with presigned URLs for immediate access
        """
        assets_list = self.list_site_assets(asset_type)
        
        if 'error' in assets_list:
            return assets_list
        
        # Add presigned URLs to each asset
        for category in ['images', 'documents', 'media']:
            if category in assets_list:
                for asset in assets_list[category]:
                    asset['presigned_url'] = self.generate_presigned_url(asset['key'])
                    asset['url_expires_in'] = self.presigned_url_expiry
        
        return assets_list
    
    def check_bucket_access(self) -> Dict[str, any]:
        """
        Test bucket access and return configuration info
        """
        logging.info(f"Checking bucket access for: {self.bucket_name}")
        
        if not self.s3_client:
            error_msg = 'S3 client not configured - check AWS credentials'
            logging.error(error_msg)
            return {
                'accessible': False,
                'error': error_msg,
                'bucket_name': self.bucket_name,
                'region': self.region
            }
        
        try:
            # Test bucket access
            self.s3_client.head_bucket(Bucket=self.bucket_name)
            
            # Test list permissions
            response = self.s3_client.list_objects_v2(Bucket=self.bucket_name, MaxKeys=1)
            object_count = response.get('KeyCount', 0)
            
            logging.info(f"✅ Bucket access successful! Found {object_count} objects")
            
            return {
                'accessible': True,
                'bucket_name': self.bucket_name,
                'region': self.region,
                'presigned_url_expiry': self.presigned_url_expiry,
                'object_count': object_count
            }
        except ClientError as e:
            error_code = e.response['Error']['Code']
            error_message = e.response['Error']['Message']
            error_msg = f"Bucket access failed: {error_code} - {error_message}"
            logging.error(error_msg)
            
            return {
                'accessible': False,
                'error': error_msg,
                'bucket_name': self.bucket_name,
                'region': self.region,
                'error_code': error_code
            }
        except Exception as e:
            error_msg = f"Unexpected error: {str(e)}"
            logging.error(error_msg)
            return {
                'accessible': False,
                'error': error_msg,
                'bucket_name': self.bucket_name,
                'region': self.region
            }

# Global service instance
s3_site_service = S3SiteService() 