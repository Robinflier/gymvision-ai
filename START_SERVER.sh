#!/bin/bash

# Start Flask backend server for GymVision AI
# Make sure you have GROQ_API_KEY set in your environment

cd /Users/robinflier/Documents/GV_AI

echo "Starting Flask server on http://0.0.0.0:5000"
echo "Make sure your iPhone and Mac are on the same WiFi network!"
echo ""
echo "Your Mac's IP: $(ifconfig | grep 'inet ' | grep -v 127.0.0.1 | head -1 | awk '{print $2}')"
echo ""

# Check if GROQ_API_KEY is set
if [ -z "$GROQ_API_KEY" ]; then
    echo "⚠️  WARNING: GROQ_API_KEY is not set!"
    echo "   Set it with: export GROQ_API_KEY='your-key-here'"
    echo "   Or get one from: https://console.groq.com"
    echo ""
fi

# Start Flask server
python3 app.py

