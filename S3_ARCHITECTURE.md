# S3 Architecture with Authentication

This document describes the new S3 architecture where `api-site` owns all S3 logic and `api-game` communicates via authenticated HTTP requests.

## 🏗️ **Architecture Overview**

```
┌─────────────┐    HTTP + Auth    ┌─────────────┐    AWS S3
│  api-game   │ ────────────────→ │  api-site   │ ────────→ │
│             │                    │             │           │
│ - Game      │                    │ - S3        │           │
│   Logic     │                    │   Service   │           │
│ - S3 Client │                    │ - Auth      │           │
│ - Auth      │                    │ - Site      │           │
└─────────────┘                    │   Logic     │           │
                                   └─────────────┘           │
                                                             │
```

## 🔐 **Authentication**

### **API Keys**
- **`rollplay-game-service`**: Used by api-game to access S3
- **`rollplay-admin`**: Admin access to S3 endpoints

### **Request Format**
```http
GET /s3/assets
Authorization: Bearer rollplay-game-service
Content-Type: application/json
```

## 📁 **File Structure**

```
rollplay/
├── api-site/
│   ├── s3_service.py          # S3 logic (ONLY HERE)
│   ├── auth_middleware.py     # Authentication
│   ├── app.py                 # S3 endpoints with auth
│   └── requirements.txt       # boto3, python-dotenv
├── api-game/
│   ├── s3_client.py          # HTTP client for api-site
│   ├── app.py                # Proxy endpoints
│   └── requirements.txt       # requests (no boto3)
└── test_s3_architecture.py   # Test script
```

## 🔧 **Environment Variables**

### **api-site** (S3 Owner)
```bash
# AWS Configuration
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=us-west-2

# S3 Configuration
S3_BUCKET_NAME=your-bucket-name
PRESIGNED_URL_EXPIRY=3600

# Authentication
SITE_API_KEY=rollplay-admin
```

### **api-game** (S3 Client)
```bash
# Site API Configuration
SITE_API_URL=http://api-site:8082
SITE_API_KEY=rollplay-game-service
```

## 🚀 **API Endpoints**

### **api-site** (S3 Service)
All endpoints require authentication:

```http
GET /s3/health                    # Check S3 access
GET /s3/assets                    # List all assets
GET /s3/assets?asset_type=maps   # Filter by type
GET /s3/assets/with-urls         # Assets with presigned URLs
GET /s3/assets/{object_key}      # Specific asset
GET /s3/assets/{object_key}/url  # Generate presigned URL
```

### **api-game** (Proxy Service)
Same endpoints, but proxy to api-site:

```http
GET /s3/health                    # Proxy to api-site
GET /s3/assets                    # Proxy to api-site
GET /s3/assets/with-urls         # Proxy to api-site
GET /s3/assets/{object_key}      # Proxy to api-site
GET /s3/assets/{object_key}/url  # Proxy to api-site
```

## 🔄 **Request Flow**

### **Example: Get Game Maps**

1. **Client** → `api-game`: `GET /s3/assets?asset_type=maps`
2. **api-game** → `api-site`: `GET /s3/assets?asset_type=maps` + Auth
3. **api-site** → **AWS S3**: List objects in bucket
4. **api-site** → **api-game**: Return filtered assets
5. **api-game** → **Client**: Return assets

## 🛡️ **Security Features**

### **Authentication**
- Bearer token authentication
- API key validation
- Service-specific keys

### **Error Handling**
- Graceful degradation when api-site is unavailable
- Detailed error logging
- Timeout protection

### **Network Security**
- Internal Docker network communication
- No direct S3 access from api-game
- Centralized credential management

## 📊 **Benefits**

### **✅ Advantages**
1. **Single Source of Truth**: Only api-site handles S3
2. **Clear Service Boundaries**: Each service has distinct responsibilities
3. **Easy to Debug**: Standard HTTP requests/responses
4. **Scalable**: Can add caching, load balancing
5. **Secure**: Centralized authentication
6. **No Shared Code**: Independent service deployments

### **⚠️ Considerations**
1. **Network Dependency**: api-game needs api-site
2. **Latency**: Extra HTTP hop for S3 operations
3. **Error Propagation**: Network failures affect S3 access

## 🧪 **Testing**

### **Run Architecture Tests**
```bash
python test_s3_architecture.py
```

### **Test Cases**
- ✅ Environment configuration
- ✅ Service communication
- ✅ Authentication (valid/invalid keys)
- ✅ Direct api-site access
- ✅ api-game proxy functionality

## 🔧 **Development Setup**

### **1. Environment Variables**
```bash
# .env
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
S3_BUCKET_NAME=your-bucket
AWS_REGION=us-west-2
SITE_API_KEY=rollplay-admin
```

### **2. Docker Compose**
```yaml
# docker-compose.dev.yml
services:
  api-site:
    environment:
      - SITE_API_KEY=rollplay-admin
    ports:
      - "8082:8082"

  api-game:
    environment:
      - SITE_API_URL=http://api-site:8082
      - SITE_API_KEY=rollplay-game-service
    ports:
      - "8081:8081"
```

## 🚀 **Production Deployment**

### **1. Update Docker Images**
```dockerfile
# api-site/Dockerfile
# Include S3 service and auth middleware

# api-game/Dockerfile  
# Include S3 client (no boto3)
```

### **2. Environment Configuration**
```bash
# Production .env
AWS_ACCESS_KEY_ID=prod_key
AWS_SECRET_ACCESS_KEY=prod_secret
S3_BUCKET_NAME=rollplay-prod-assets
SITE_API_KEY=secure-production-key
```

### **3. Health Checks**
```yaml
# docker-compose.yml
services:
  api-site:
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8082/health"]
      
  api-game:
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8081/health"]
```

## 🔍 **Monitoring & Debugging**

### **Logs to Watch**
```bash
# api-site logs
docker logs api-site | grep "S3\|Auth"

# api-game logs  
docker logs api-game | grep "S3\|Site API"
```

### **Common Issues**
1. **Authentication Failures**: Check API keys
2. **Network Timeouts**: Verify service connectivity
3. **S3 Access Denied**: Check AWS credentials
4. **Missing Assets**: Verify bucket contents

## 🔄 **Migration from Old Architecture**

### **What Changed**
- ❌ Removed S3 service from api-game
- ✅ Added S3 client to api-game
- ✅ Added authentication to api-site
- ✅ Centralized S3 logic in api-site

### **Migration Steps**
1. Update environment variables
2. Deploy new api-site with auth
3. Deploy new api-game with client
4. Test all S3 endpoints
5. Monitor for errors

## 🎯 **Future Enhancements**

### **Planned Improvements**
1. **Caching**: Redis cache for frequently accessed assets
2. **Rate Limiting**: Prevent abuse of S3 endpoints
3. **Metrics**: Track S3 usage and performance
4. **Upload Support**: Add file upload endpoints
5. **CDN Integration**: CloudFront for global distribution

### **Security Enhancements**
1. **JWT Tokens**: Replace API keys with JWT
2. **Role-Based Access**: Different permissions per service
3. **Audit Logging**: Track all S3 operations
4. **Encryption**: Client-side encryption for sensitive assets 