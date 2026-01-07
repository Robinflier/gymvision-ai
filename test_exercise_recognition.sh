#!/bin/bash

# Test script voor /api/recognize-exercise endpoint
# Gebruik: ./test_exercise_recognition.sh [RENDER_URL] [IMAGE_PATH]

# Default waarden
RENDER_URL="${1:-http://localhost:5000}"
IMAGE_PATH="${2:-../images/benchpress.jpg}"

echo "🧪 Testing Exercise Recognition Endpoint"
echo "=========================================="
echo "URL: $RENDER_URL/api/recognize-exercise"
echo "Image: $IMAGE_PATH"
echo ""

# Check of image bestaat
if [ ! -f "$IMAGE_PATH" ]; then
    echo "❌ Error: Image file not found: $IMAGE_PATH"
    echo "💡 Tip: Gebruik een van deze images:"
    ls ../images/*.jpg | head -5
    exit 1
fi

# Test de endpoint
echo "📤 Sending request..."
RESPONSE=$(curl -s -X POST "$RENDER_URL/api/recognize-exercise" \
  -F "image=@$IMAGE_PATH" \
  -w "\nHTTP_CODE:%{http_code}")

# Extract HTTP code en body
HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_CODE/d')

echo ""
echo "📥 Response:"
echo "$BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"
echo ""
echo "HTTP Status: $HTTP_CODE"

# Check result
if [ "$HTTP_CODE" = "200" ]; then
    EXERCISE=$(echo "$BODY" | python3 -c "import sys, json; print(json.load(sys.stdin).get('exercise', 'N/A'))" 2>/dev/null)
    if [ -n "$EXERCISE" ]; then
        echo "✅ Success! Recognized exercise: $EXERCISE"
    else
        echo "⚠️  Response received but no exercise found"
    fi
else
    echo "❌ Error: Request failed with status $HTTP_CODE"
fi

