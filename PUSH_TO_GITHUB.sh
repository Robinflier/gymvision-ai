#!/bin/bash

# Script om code naar GitHub te pushen voor GymVision AI

cd /Users/robinflier/Documents/GV_AI

echo "🚀 Preparing to push to GitHub..."
echo ""

# Stap 1: Verwijder oude remote
echo "📦 Removing old remote..."
git remote remove origin 2>/dev/null || echo "No old remote to remove"

# Stap 2: Check of je al een repo hebt gemaakt op GitHub
echo ""
echo "⚠️  BELANGRIJK: Maak eerst een nieuwe repo op GitHub!"
echo "   1. Ga naar https://github.com/Pourify"
echo "   2. Klik 'New repository'"
echo "   3. Naam: 'gymvision-ai'"
echo "   4. Kies Private of Public"
echo "   5. NIET 'Add README' aanvinken"
echo "   6. Klik 'Create repository'"
echo ""
read -p "Heb je de repo al gemaakt op GitHub? (y/n): " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Maak eerst de repo op GitHub, dan run dit script opnieuw"
    exit 1
fi

# Stap 3: Voeg nieuwe remote toe
echo "🔗 Adding new remote..."
git remote add origin https://github.com/Pourify/gymvision-ai.git

# Stap 4: Add alle bestanden (behalve die in .gitignore)
echo "📝 Adding files..."
git add .

# Stap 5: Commit
echo "💾 Committing..."
git commit -m "Initial commit - GymVision AI backend and mobile app" || echo "No changes to commit"

# Stap 6: Push
echo "⬆️  Pushing to GitHub..."
git push -u origin main

echo ""
echo "✅ Done! Je code staat nu op GitHub"
echo "   URL: https://github.com/Pourify/gymvision-ai"
echo ""
echo "📋 Volgende stap: Ga naar Render en deploy!"

