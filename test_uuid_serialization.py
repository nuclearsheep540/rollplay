#!/usr/bin/env python3

"""
Test script to reproduce the UUID serialization issue
"""

from uuid import UUID
import json

# Test UUID serialization
test_uuid = UUID('550e8400-e29b-41d4-a716-446655440000')
print("UUID object:", test_uuid)
print("UUID type:", type(test_uuid))
print("UUID string:", str(test_uuid))

# Test JSON serialization
test_data = {
    "id": test_uuid,
    "name": "Test Game"
}

print("\nTest data:", test_data)

# Try to serialize to JSON
try:
    # This should fail
    json_str = json.dumps(test_data)
    print("JSON serialization successful:", json_str)
except Exception as e:
    print("JSON serialization failed:", e)
    
# Try with default serializer
try:
    json_str = json.dumps(test_data, default=str)
    print("JSON with default=str:", json_str)
except Exception as e:
    print("JSON with default=str failed:", e)

# Test UUID.int
print("\nUUID integer value:", test_uuid.int)
print("UUID integer type:", type(test_uuid.int))

# Test parsing UUID from integer (this should fail)
try:
    uuid_from_int = UUID(str(test_uuid.int))
    print("UUID from integer success:", uuid_from_int)
except Exception as e:
    print("UUID from integer failed:", e)