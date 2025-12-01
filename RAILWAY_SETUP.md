# Railway Backend Setup - Step by Step

## Prerequisites

1. **GitHub Account** (free)
2. **GROQ API Key** (free from https://console.groq.com)
3. **Your code pushed to GitHub** (optional, Railway can deploy from local too)

---

## Step 1: Get GROQ API Key

1. Go to https://console.groq.com
2. Sign up (free)
3. Go to "API Keys" section
4. Click "Create API Key"
5. Copy the key (you'll need it in Step 4)

---

## Step 2: Push Code to GitHub (if not already done)

```bash
cd /Users/robinflier/Documents/GV_AI

# Initialize git if not already done
git init
git add .
git commit -m "Initial commit"

# Create repo on GitHub, then:
git remote add origin https://github.com/yourusername/GV_AI.git
git push -u origin main
```

---

## Step 3: Deploy to Railway

1. **Go to Railway**: https://railway.app
2. **Sign up** with GitHub
3. **Click "New Project"**
4. **Select "Deploy from GitHub repo"**
5. **Select your repository** (GV_AI)
6. Railway will automatically:
   - Detect Python
   - Install dependencies from `requirements.txt`
   - Start the app using `Procfile`

---

## Step 4: Configure Environment Variables

1. In Railway dashboard, click on your project
2. Go to **"Variables"** tab
3. Click **"New Variable"**
4. Add these variables:

   **Variable 1:**
   - Name: `GROQ_API_KEY`
   - Value: `your-groq-api-key-from-step-1`

   **Variable 2:**
   - Name: `SECRET_KEY`
   - Value: Generate with: `openssl rand -hex 32`
     (Or use Railway's "Generate" button)

5. Click **"Deploy"** (Railway will redeploy with new variables)

---

## Step 5: Get Your Backend URL

1. In Railway dashboard, click on your service
2. Go to **"Settings"** tab
3. Scroll to **"Domains"** section
4. Railway gives you a URL like: `https://gymvision-ai.up.railway.app`
5. **Copy this URL** - you'll need it next!

---

## Step 6: Update Your App

1. Open `www/app.js` in your project
2. Find line 15 (around the API_BASE_URL definition)
3. Replace with your Railway URL:

```javascript
const API_BASE_URL = window.Capacitor 
    ? 'https://gymvision-ai.up.railway.app'  // YOUR RAILWAY URL HERE
    : '';
```

4. Save the file

---

## Step 7: Sync to iOS

```bash
cd /Users/robinflier/Documents/GV_AI
npx cap sync ios
```

---

## Step 8: Rebuild App in Xcode

1. Open Xcode
2. Stop the app if running
3. Press **⌘ + R** to rebuild and run
4. Test Vision chat - it should work now! 🎉

---

## What Your Backend Provides

✅ **AI Workout Builder** - Vision chat creates workouts
✅ **Exercise Metadata** - Muscle groups, videos, images
✅ **AI Detection** - Camera-based exercise recognition (if models uploaded)
✅ **User Authentication** - Auto-login for native app
✅ **Exercise List** - All 91 exercises with data

---

## Testing

Test your backend is working:

```bash
# Test 1: Check if server is running
curl https://your-railway-url.railway.app/check-auth

# Should return: {"authenticated": false}

# Test 2: Test native login
curl -X POST https://your-railway-url.railway.app/native-login

# Should return: {"success": true, "authenticated": true, ...}
```

---

## Troubleshooting

**"Deployment failed":**
- Check Railway logs (in dashboard)
- Make sure `requirements.txt` has all packages
- Check Python version (should be 3.11+)

**"GROQ API error":**
- Verify GROQ_API_KEY is set correctly in Railway
- Check if you have Groq credits

**"App can't connect":**
- Make sure URL in `app.js` matches Railway URL exactly
- Check Railway service is "Active" (not sleeping)
- Try redeploying in Railway

**"CORS error":**
- Already fixed in code, should work automatically

---

## Cost

**Railway Free Tier:**
- 500 hours/month free
- $5/month for unlimited hours
- Perfect for testing and small apps

**GROQ Free Tier:**
- 14,400 requests/day free
- More than enough for personal use

**Total: $0/month for testing, $5/month for production**

---

## Next Steps

Once backend is working:
1. Test Vision chat in your app
2. Test AI Workout feature
3. Consider adding ML models later (for camera detection)
4. Set up custom domain (optional)

