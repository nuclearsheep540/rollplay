# S3 Integration for Rollplay APIs

This document describes the S3 integration implemented for both `api-game` and `api-site` services in the Rollplay application.

## Overview

The S3 integration provides secure, scalable storage for game assets and site content with presigned URL generation for direct client access.

## Architecture

### Services
- **api-game**: Handles game-specific assets (maps, audio, images)
- **api-site**: Handles site-wide assets (images, documents, media)

### Bucket Configuration
- **Game Assets**: `rollplay-game-assets` (default)
- **Site Assets**: `rollplay-site-assets` (default)
- **Region**: `us-west-2` (default)

## Environment Variables

Add these to your `.env` file:

```bash
# AWS Configuration
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=us-west-2

# S3 Configuration
S3_BUCKET_NAME=your-bucket-name
PRESIGNED_URL_EXPIRY=3600  # 1 hour default

# Optional for temporary credentials
AWS_SESSION_TOKEN=your_session_token
```

## API Endpoints

### Game API (`api-game`)

#### Health Check
```http
GET /s3/health
```
Returns bucket access status and configuration info.

#### List Assets
```http
GET /s3/assets?asset_type=maps
```
Lists all game assets, optionally filtered by type (`maps`, `audio`, `images`).

#### Assets with Presigned URLs
```http
GET /s3/assets/with-urls?asset_type=audio
```
Returns all assets with presigned URLs for immediate access.

#### Specific Asset
```http
GET /s3/assets/{object_key}
```
Returns metadata and presigned URL for a specific asset.

#### Generate Presigned URL
```http
GET /s3/assets/{object_key}/url?expiry=7200
```
Generates a presigned URL for a specific asset with optional expiry time.

### Site API (`api-site`)

#### Health Check
```http
GET /s3/health
```
Returns bucket access status and configuration info.

#### List Assets
```http
GET /s3/assets?asset_type=images
```
Lists all site assets, optionally filtered by type (`images`, `documents`, `media`).

#### Assets with Presigned URLs
```http
GET /s3/assets/with-urls?asset_type=documents
```
Returns all assets with presigned URLs for immediate access.

#### Specific Asset
```http
GET /s3/assets/{object_key}
```
Returns metadata and presigned URL for a specific asset.

#### Generate Presigned URL
```http
GET /s3/assets/{object_key}/url?expiry=7200
```
Generates a presigned URL for a specific asset with optional expiry time.

## Asset Categories

### Game Assets (`api-game`)
- **Maps**: `jpg`, `jpeg`, `png`, `webp`, `gif` (with 'maps' in path)
- **Audio**: `mp3`, `wav`, `m4a`, `aac`, `flac`, `ogg`
- **Images**: `jpg`, `jpeg`, `png`, `webp`, `gif`

### Site Assets (`api-site`)
- **Images**: `jpg`, `jpeg`, `png`, `webp`, `gif`, `svg`
- **Documents**: `pdf`, `doc`, `docx`, `txt`, `md`
- **Media**: `mp4`, `mov`, `avi`, `mkv`, `webm`, `mp3`, `wav`, `m4a`

## Response Format

### Asset Object
```json
{
  "id": "maps/dungeon-map.jpg",
  "name": "dungeon-map.jpg",
  "key": "maps/dungeon-map.jpg",
  "size": 1024000,
  "last_modified": "2024-01-15T10:30:00Z",
  "type": "map",
  "extension": "jpg",
  "presigned_url": "https://...",
  "url_expires_in": 3600
}
```

### Health Check Response
```json
{
  "accessible": true,
  "bucket_name": "rollplay-game-assets",
  "region": "us-west-2",
  "presigned_url_expiry": 3600,
  "object_count": 42
}
```

## Error Handling

### Common Error Responses
```json
{
  "detail": "Asset maps/dungeon-map.jpg not found"
}
```

```json
{
  "detail": "S3 client not configured - check AWS credentials"
}
```

## Security Features

1. **Presigned URLs**: Temporary, secure access to S3 objects
2. **Credential Management**: Supports IAM roles, access keys, and session tokens
3. **CORS Support**: Configured for cross-origin requests
4. **Error Handling**: Graceful degradation when S3 is unavailable

## Testing

Run the test script to verify S3 integration:

```bash
python test_s3_integration.py
```

This will test:
- Environment configuration
- API service connectivity
- S3 bucket access
- Asset listing and URL generation

## Dependencies

### Added to requirements.txt
```
boto3==1.34.0
python-dotenv==1.0.0
```

## Usage Examples

### Frontend Integration

```javascript
// Get game maps with presigned URLs
const response = await fetch('/api/game/s3/assets/with-urls?asset_type=maps');
const assets = await response.json();

// Display map with direct S3 access
const mapUrl = assets.maps[0].presigned_url;
const mapImage = document.createElement('img');
mapImage.src = mapUrl;
```

### Audio Integration

```javascript
// Get audio files for game
const response = await fetch('/api/game/s3/assets?asset_type=audio');
const audioAssets = await response.json();

// Play audio directly from S3
const audio = new Audio(audioAssets.audio[0].presigned_url);
audio.play();
```

## Troubleshooting

### Common Issues

1. **Credentials Not Found**
   - Check AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY
   - Verify IAM permissions for S3 access

2. **Bucket Not Found**
   - Verify S3_BUCKET_NAME is correct
   - Check AWS_REGION matches bucket location

3. **CORS Errors**
   - Configure S3 bucket CORS policy for your domain
   - Check FastAPI CORS middleware configuration

4. **Presigned URL Expiry**
   - URLs expire after PRESIGNED_URL_EXPIRY seconds
   - Regenerate URLs before expiry for long-running sessions

### Debug Mode

Enable detailed logging by setting log level to DEBUG in your environment.

## Future Enhancements

1. **Upload Support**: Add endpoints for file uploads to S3
2. **Asset Management**: Implement asset metadata and tagging
3. **Caching**: Add Redis caching for frequently accessed assets
4. **CDN Integration**: Configure CloudFront for global distribution
5. **Versioning**: Implement S3 versioning for asset history 