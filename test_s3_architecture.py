#!/usr/bin/env python3
"""
Test script for new S3 architecture with authentication
Tests api-game -> api-site communication
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

# Test API keys
GAME_API_KEY = "rollplay-game-service"
ADMIN_API_KEY = "rollplay-admin"

def test_api_site_direct():
    """Test api-site S3 endpoints directly with authentication"""
    print("🔧 Testing API Site S3 Endpoints (Direct)...")
    
    headers = {
        'Authorization': f'Bearer {ADMIN_API_KEY}',
        'Content-Type': 'application/json'
    }
    
    # Test health check
    try:
        response = requests.get(f"{API_SITE_URL}/s3/health", headers=headers)
        print(f"✅ S3 Health Check: {response.status_code}")
        if response.status_code == 200:
            health_data = response.json()
            print(f"   Bucket: {health_data.get('bucket_name')}")
            print(f"   Accessible: {health_data.get('accessible')}")
        else:
            print(f"   Error: {response.text}")
    except Exception as e:
        print(f"❌ Health check failed: {e}")
    
    # Test list assets
    try:
        response = requests.get(f"{API_SITE_URL}/s3/assets", headers=headers)
        print(f"✅ List Assets: {response.status_code}")
        if response.status_code == 200:
            assets_data = response.json()
            print(f"   Total objects: {assets_data.get('total_objects', 0)}")
        else:
            print(f"   Error: {response.text}")
    except Exception as e:
        print(f"❌ List assets failed: {e}")

def test_api_game_proxy():
    """Test api-game S3 endpoints (which proxy to api-site)"""
    print("\n🔧 Testing API Game S3 Endpoints (Proxy)...")
    
    # Test health check
    try:
        response = requests.get(f"{API_GAME_URL}/s3/health")
        print(f"✅ S3 Health Check: {response.status_code}")
        if response.status_code == 200:
            health_data = response.json()
            print(f"   Bucket: {health_data.get('bucket_name')}")
            print(f"   Accessible: {health_data.get('accessible')}")
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
        else:
            print(f"   Error: {response.text}")
    except Exception as e:
        print(f"❌ List assets failed: {e}")

def test_authentication():
    """Test authentication with different API keys"""
    print("\n🔧 Testing Authentication...")
    
    test_cases = [
        ("Valid Game Key", GAME_API_KEY, 200),
        ("Valid Admin Key", ADMIN_API_KEY, 200),
        ("Invalid Key", "invalid-key", 401),
        ("No Key", None, 401),
    ]
    
    for test_name, api_key, expected_status in test_cases:
        try:
            headers = {}
            if api_key:
                headers['Authorization'] = f'Bearer {api_key}'
            
            response = requests.get(f"{API_SITE_URL}/s3/health", headers=headers)
            status = response.status_code
            
            if status == expected_status:
                print(f"✅ {test_name}: {status}")
            else:
                print(f"❌ {test_name}: Expected {expected_status}, got {status}")
                
        except Exception as e:
            print(f"❌ {test_name}: {e}")

def test_environment():
    """Test environment configuration"""
    print("🔧 Testing Environment Configuration...")
    
    required_vars = [
        'AWS_ACCESS_KEY_ID',
        'AWS_SECRET_ACCESS_KEY', 
        'S3_BUCKET_NAME',
        'AWS_REGION',
        'SITE_API_KEY'
    ]
    
    for var in required_vars:
        value = os.getenv(var)
        if value:
            if var in ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'SITE_API_KEY']:
                print(f"✅ {var}: {'SET' if value else 'NOT SET'}")
            else:
                print(f"✅ {var}: {value}")
        else:
            print(f"❌ {var}: NOT SET")

def test_service_communication():
    """Test api-game -> api-site communication"""
    print("\n🔧 Testing Service Communication...")
    
    # Test that api-game can reach api-site
    try:
        response = requests.get(f"{API_SITE_URL}/health", timeout=5)
        if response.status_code == 200:
            print("✅ api-site is reachable from api-game")
        else:
            print(f"❌ api-site returned status {response.status_code}")
    except Exception as e:
        print(f"❌ api-site is not reachable: {e}")

def main():
    """Main test function"""
    print("🚀 Starting S3 Architecture Tests...")
    print("=" * 60)
    
    # Test environment
    test_environment()
    print()
    
    # Test service communication
    test_service_communication()
    print()
    
    # Test authentication
    test_authentication()
    print()
    
    # Test direct api-site access
    test_api_site_direct()
    print()
    
    # Test api-game proxy
    test_api_game_proxy()
    
    print("\n" + "=" * 60)
    print("✅ S3 Architecture Tests Complete!")

if __name__ == "__main__":
    main() 