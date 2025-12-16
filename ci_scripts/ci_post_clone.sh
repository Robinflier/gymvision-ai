#!/bin/sh

# Xcode Cloud post-clone script
# This runs after the repository is cloned but before the build starts

set -e

echo "🔧 Running Xcode Cloud post-clone script..."
echo "📁 Current directory: $(pwd)"
echo "📁 CI_WORKSPACE: ${CI_WORKSPACE:-not set}"

# Navigate to iOS directory (handle both local and CI environments)
if [ -n "$CI_WORKSPACE" ]; then
    cd "$CI_WORKSPACE/ios/App"
else
    cd ios/App
fi

echo "📁 Working directory: $(pwd)"
echo "📁 Checking if Podfile exists: $(test -f Podfile && echo 'YES' || echo 'NO')"

# Install CocoaPods dependencies
echo "📦 Installing CocoaPods dependencies..."
pod install --repo-update

# Verify Pods were installed
if [ -d "Pods" ]; then
    echo "✅ CocoaPods installation complete! Pods directory exists."
    echo "📁 Pods directory size: $(du -sh Pods | cut -f1)"
else
    echo "❌ ERROR: Pods directory was not created!"
    exit 1
fi

# Verify xcconfig files exist
if [ -f "Pods/Target Support Files/Pods-App/Pods-App.release.xcconfig" ]; then
    echo "✅ Pods-App.release.xcconfig exists"
else
    echo "❌ ERROR: Pods-App.release.xcconfig not found!"
    exit 1
fi

echo "✅ All checks passed!"

