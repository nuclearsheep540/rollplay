#!/usr/bin/env python3
"""
Test script for S3 integration with Rollplay APIs
"""

import requests
import json
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configuration
API_GAME_URL = "http://localhost:8081"
API_SITE_URL = "http://localhost:8082"

def test_api_game_s3():
    """Test S3 endpoints for api-game service"""
    print("🔧 Testing API Game S3 Integration...")
    
    # Test health check
    try:
        response = requests.get(f"{API_GAME_URL}/s3/health")
        print(f"✅ S3 Health Check: {response.status_code}")
        if response.status_code == 200:
            health_data = response.json()
            print(f"   Bucket: {health_data.get('bucket_name')}")
            print(f"   Accessible: {health_data.get('accessible')}")
            if not health_data.get('accessible'):
                print(f"   Error: {health_data.get('error')}")
        else:
            print(f"   Error: {response.text}")
    except Exception as e:
        print(f"❌ Health check failed: {e}")
    
    # Test list assets
    try:
        response = requests.get(f"{API_GAME_URL}/s3/assets")
        print(f"✅ List Assets: {response.status_code}")
        if response.status_code == 200:
            assets_data = response.json()
            print(f"   Total objects: {assets_data.get('total_objects', 0)}")
            print(f"   Maps: {len(assets_data.get('maps', []))}")
            print(f"   Audio: {len(assets_data.get('audio', []))}")
            print(f"   Images: {len(assets_data.get('images', []))}")
        else:
            print(f"   Error: {response.text}")
    except Exception as e:
        print(f"❌ List assets failed: {e}")
    
    # Test assets with URLs
    try:
        response = requests.get(f"{API_GAME_URL}/s3/assets/with-urls")
        print(f"✅ Assets with URLs: {response.status_code}")
        if response.status_code == 200:
            assets_data = response.json()
            if 'maps' in assets_data and assets_data['maps']:
                first_map = assets_data['maps'][0]
                print(f"   First map: {first_map.get('name')}")
                print(f"   Has presigned URL: {'presigned_url' in first_map}")
        else:
            print(f"   Error: {response.text}")
    except Exception as e:
        print(f"❌ Assets with URLs failed: {e}")

def test_api_site_s3():
    """Test S3 endpoints for api-site service"""
    print("\n🔧 Testing API Site S3 Integration...")
    
    # Test health check
    try:
        response = requests.get(f"{API_SITE_URL}/s3/health")
        print(f"✅ S3 Health Check: {response.status_code}")
        if response.status_code == 200:
            health_data = response.json()
            print(f"   Bucket: {health_data.get('bucket_name')}")
            print(f"   Accessible: {health_data.get('accessible')}")
            if not health_data.get('accessible'):
                print(f"   Error: {health_data.get('error')}")
        else:
            print(f"   Error: {response.text}")
    except Exception as e:
        print(f"❌ Health check failed: {e}")
    
    # Test list assets
    try:
        response = requests.get(f"{API_SITE_URL}/s3/assets")
        print(f"✅ List Assets: {response.status_code}")
        if response.status_code == 200:
            assets_data = response.json()
            print(f"   Total objects: {assets_data.get('total_objects', 0)}")
            print(f"   Images: {len(assets_data.get('images', []))}")
            print(f"   Documents: {len(assets_data.get('documents', []))}")
            print(f"   Media: {len(assets_data.get('media', []))}")
        else:
            print(f"   Error: {response.text}")
    except Exception as e:
        print(f"❌ List assets failed: {e}")
    
    # Test assets with URLs
    try:
        response = requests.get(f"{API_SITE_URL}/s3/assets/with-urls")
        print(f"✅ Assets with URLs: {response.status_code}")
        if response.status_code == 200:
            assets_data = response.json()
            if 'images' in assets_data and assets_data['images']:
                first_image = assets_data['images'][0]
                print(f"   First image: {first_image.get('name')}")
                print(f"   Has presigned URL: {'presigned_url' in first_image}")
        else:
            print(f"   Error: {response.text}")
    except Exception as e:
        print(f"❌ Assets with URLs failed: {e}")

def test_environment():
    """Test environment configuration"""
    print("🔧 Testing Environment Configuration...")
    
    required_vars = [
        'AWS_ACCESS_KEY_ID',
        'AWS_SECRET_ACCESS_KEY', 
        'S3_BUCKET_NAME',
        'AWS_REGION'
    ]
    
    for var in required_vars:
        value = os.getenv(var)
        if value:
            if var in ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY']:
                print(f"✅ {var}: {'SET' if value else 'NOT SET'}")
            else:
                print(f"✅ {var}: {value}")
        else:
            print(f"❌ {var}: NOT SET")

def main():
    """Main test function"""
    print("🚀 Starting S3 Integration Tests...")
    print("=" * 50)
    
    # Test environment
    test_environment()
    print()
    
    # Test API services
    test_api_game_s3()
    test_api_site_s3()
    
    print("\n" + "=" * 50)
    print("✅ S3 Integration Tests Complete!")

if __name__ == "__main__":
    main() 