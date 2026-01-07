#!/usr/bin/env python3
"""
Test script for /api/recognize-exercise endpoint
Tests the OpenAI Vision API integration
"""
import requests
import os
import sys

# Test configuration
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:5004")
IMAGE_PATH = sys.argv[1] if len(sys.argv) > 1 else None

if not IMAGE_PATH:
    print("Usage: python3 test_recognize_exercise.py <path_to_image>")
    print("Example: python3 test_recognize_exercise.py ../images/benchpress.jpg")
    sys.exit(1)

if not os.path.exists(IMAGE_PATH):
    print(f"Error: Image file not found: {IMAGE_PATH}")
    sys.exit(1)

print(f"🧪 Testing Exercise Recognition Endpoint")
print(f"=" * 50)
print(f"Backend URL: {BACKEND_URL}")
print(f"Image: {IMAGE_PATH}")
print()

# Read image file
try:
    with open(IMAGE_PATH, 'rb') as f:
        image_data = f.read()
    print(f"✓ Image loaded ({len(image_data)} bytes)")
except Exception as e:
    print(f"❌ Error loading image: {e}")
    sys.exit(1)

# Send request
print(f"\n📤 Sending request to {BACKEND_URL}/api/recognize-exercise...")
try:
    files = {'image': (os.path.basename(IMAGE_PATH), image_data, 'image/jpeg')}
    response = requests.post(
        f"{BACKEND_URL}/api/recognize-exercise",
        files=files,
        timeout=30
    )
    
    print(f"📥 Response received")
    print(f"   Status Code: {response.status_code}")
    print()
    
    if response.status_code == 200:
        data = response.json()
        print(f"✅ Success!")
        print(f"   Exercise: {data.get('exercise', 'N/A')}")
        print()
        print(f"Full response: {data}")
    else:
        print(f"❌ Error!")
        print(f"   Status: {response.status_code}")
        try:
            error_data = response.json()
            print(f"   Error: {error_data}")
        except:
            print(f"   Response: {response.text}")
            
except requests.exceptions.ConnectionError:
    print(f"❌ Connection Error: Could not connect to {BACKEND_URL}")
    print(f"   Make sure the Flask server is running!")
    sys.exit(1)
except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

