#!/bin/bash

# GymVision AI - Capacitor Setup Script
# Run this script to set up Capacitor for App Store submission

echo "🚀 Starting Capacitor setup for GymVision AI..."
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed!"
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js found: $(node --version)"
echo ""

# Initialize npm if package.json doesn't exist
if [ ! -f "package.json" ]; then
    echo "📦 Initializing npm..."
    npm init -y
    echo "✅ package.json created"
else
    echo "✅ package.json already exists"
fi

# Install Capacitor
echo ""
echo "📦 Installing Capacitor..."
npm install @capacitor/core @capacitor/cli
npm install @capacitor/ios @capacitor/android
npm install @capacitor/camera

echo ""
echo "✅ Capacitor installed!"
echo ""

# Initialize Capacitor
echo "🔧 Initializing Capacitor..."
echo "You will be asked for:"
echo "  - App name: GymVision AI"
echo "  - App ID: com.gymvision.ai"
echo "  - Web dir: static"
echo ""

npx cap init "GymVision AI" "com.gymvision.ai" --web-dir="static"

# Add platforms
echo ""
echo "📱 Adding iOS and Android platforms..."
npx cap add ios
npx cap add android

# Sync
echo ""
echo "🔄 Syncing web app to native platforms..."
npx cap sync

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Open iOS: npx cap open ios"
echo "2. Open Android: npx cap open android"
echo "3. Follow the step-by-step guide in STAP_VOOR_STAP_GUIDE.md"
echo ""

