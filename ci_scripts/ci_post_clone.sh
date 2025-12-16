#!/bin/sh

# Xcode Cloud post-clone script
# This runs after the repository is cloned but before the build starts

set -e

echo "🔧 Running Xcode Cloud post-clone script..."

# Navigate to iOS directory
cd ios/App

# Install CocoaPods dependencies
echo "📦 Installing CocoaPods dependencies..."
pod install

echo "✅ CocoaPods installation complete!"

