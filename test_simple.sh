#!/bin/bash
# Simple test script for exercise recognition

PORT=${1:-5004}
IMAGE=${2:-../images/benchpress.jpg}

echo "🧪 Testing Exercise Recognition"
echo "Port: $PORT"
echo "Image: $IMAGE"
echo ""

# Check if image exists
if [ ! -f "$IMAGE" ]; then
    echo "❌ Image not found: $IMAGE"
    exit 1
fi

# Test the endpoint
echo "📤 Sending request..."
RESPONSE=$(curl -s -X POST "http://localhost:$PORT/api/recognize-exercise" \
    -F "image=@$IMAGE")

if [ $? -eq 0 ]; then
    echo "✅ Response received:"
    echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"
else
    echo "❌ Failed to connect. Make sure server is running on port $PORT"
    echo ""
    echo "Start server with:"
    echo "  cd /Users/robinflier/Documents/GV_AI"
    echo "  PORT=$PORT python3 app.py"
fi

