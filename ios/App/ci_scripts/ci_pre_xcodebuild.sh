#!/bin/sh

# Xcode Cloud pre-build script
# This script runs before Xcode builds the project
# It installs CocoaPods dependencies

set -e

echo "🔧 Running pre-build script..."

# Check if we're in Xcode Cloud
if [ -n "$CI_XCODEBUILD_ACTION" ]; then
    echo "📦 Installing CocoaPods dependencies..."
    
    # Navigate to the App directory where Podfile is located
    cd "$CI_WORKSPACE/ios/App"
    
    # Install pods
    pod install --repo-update
    
    echo "✅ CocoaPods installation complete"
else
    echo "⚠️  Not running in Xcode Cloud, skipping pod install"
fi

