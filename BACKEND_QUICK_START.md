# Backend Quick Start Guide

## What the Backend Needs

Your backend (`app.py`) provides these features:

### Required Features:
1. **AI Chat** (`/chat`) - Vision AI workout builder (needs GROQ_API_KEY)
2. **Exercise Info** (`/exercise-info`) - Get exercise metadata
3. **Exercise List** (`/exercises`) - Get all available exercises
4. **AI Detection** (`/predict`) - Camera-based exercise detection (needs ML models)
5. **Authentication** (`/login`, `/register`, `/check-auth`) - User accounts
6. **Native Login** (`/native-login`) - Auto-login for mobile app

### Required Files:
- `app.py` - Main Flask application
- `requirements.txt` - Python dependencies
- `Procfile` - Tells cloud service how to run the app
- `templates/` - HTML templates (login, register, etc.)
- `static/` - Static files (CSS, JS, images)
- `*.pt` files - ML models for AI detection (optional, large files)

### Environment Variables Needed:
1. **GROQ_API_KEY** (Required for AI chat)
   - Get from: https://console.groq.com
   - Free tier available

2. **SECRET_KEY** (Required for security)
   - Generate with: `openssl rand -hex 32`
   - Used for session encryption

3. **MAIL_* variables** (Optional - for email verification)
   - Only needed if you want email verification

---

## Deployment Options

### Option 1: Railway (Easiest - Recommended)

**Step 1: Create Account**
1. Go to https://railway.app
2. Sign up with GitHub
3. Click "New Project"

**Step 2: Deploy from GitHub**
1. Click "Deploy from GitHub repo"
2. Select your repository (or create one first)
3. Railway will auto-detect Python

**Step 3: Set Environment Variables**
In Railway dashboard, go to "Variables" tab and add:
```
GROQ_API_KEY=your-groq-api-key-here
SECRET_KEY=generate-with-openssl-rand-hex-32
```

**Step 4: Get Your URL**
Railway will give you a URL like: `https://gymvision-ai.up.railway.app`

**Step 5: Update App**
1. Open `www/app.js`
2. Find line 15: `const API_BASE_URL = ...`
3. Replace with your Railway URL:
   ```javascript
   const API_BASE_URL = window.Capacitor 
       ? 'https://gymvision-ai.up.railway.app'
       : '';
   ```
4. Run: `npx cap sync ios`

---

### Option 2: Render (Free Tier)

**Step 1: Create Account**
1. Go to https://render.com
2. Sign up with GitHub

**Step 2: Create Web Service**
1. Click "New" → "Web Service"
2. Connect your GitHub repo
3. Settings:
   - **Name**: `gymvision-ai`
   - **Environment**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `python app.py`
   - **Port**: `5000`

**Step 3: Environment Variables**
Add in Render dashboard:
- `GROQ_API_KEY`
- `SECRET_KEY`

**Step 4: Deploy**
Render will give you: `https://gymvision-ai.onrender.com`

---

### Option 3: Fly.io (Good for ML models)

**Step 1: Install Fly CLI**
```bash
curl -L https://fly.io/install.sh | sh
```

**Step 2: Login**
```bash
fly auth login
```

**Step 3: Create App**
```bash
cd /Users/robinflier/Documents/GV_AI
fly launch
```

**Step 4: Set Secrets**
```bash
fly secrets set GROQ_API_KEY=your-key
fly secrets set SECRET_KEY=$(openssl rand -hex 32)
```

---

## What Files to Include in Deployment

### Required:
- ✅ `app.py`
- ✅ `requirements.txt`
- ✅ `Procfile`
- ✅ `templates/` folder
- ✅ `static/` folder (or just copy to www/)

### Optional (Large files - can skip for now):
- ⚠️ `*.pt` files (ML models - very large, ~500MB each)
  - AI detection won't work without these
  - Can add later if needed

### Don't Include:
- ❌ `gymvision.db` (database - will be created automatically)
- ❌ `__pycache__/`
- ❌ `.env` files
- ❌ `node_modules/`
- ❌ `ios/`, `android/` folders

---

## Quick Setup Checklist

### Before Deployment:
- [ ] Get GROQ API key from https://console.groq.com
- [ ] Generate SECRET_KEY: `openssl rand -hex 32`
- [ ] Make sure `requirements.txt` exists
- [ ] Make sure `Procfile` exists
- [ ] Push code to GitHub (if using Railway/Render)

### After Deployment:
- [ ] Get your backend URL (e.g., `https://yourapp.railway.app`)
- [ ] Update `www/app.js` line 15 with your URL
- [ ] Run `npx cap sync ios`
- [ ] Rebuild app in Xcode
- [ ] Test Vision chat in app

---

## Testing Your Backend

Once deployed, test these endpoints:

```bash
# Check if server is running
curl https://your-app-url.com/check-auth

# Should return: {"authenticated": false}

# Test native login
curl -X POST https://your-app-url.com/native-login

# Should return: {"success": true, "authenticated": true, ...}
```

---

## Troubleshooting

**"Module not found" errors:**
- Make sure `requirements.txt` has all dependencies
- Check that cloud service installed packages correctly

**"GROQ API error":**
- Verify GROQ_API_KEY is set correctly
- Check if you have Groq credits

**"CORS error":**
- Already fixed in `app.py` with `CORS(app)`
- Should work automatically

**"Database error":**
- Database is created automatically on first run
- Make sure cloud service has write permissions

---

## Cost Estimate

- **Railway**: Free tier (500 hours/month), then $5/month
- **Render**: Free tier (sleeps after 15min inactivity), then $7/month
- **Fly.io**: Free tier (3 VMs), then pay-as-you-go
- **GROQ API**: Free tier (14,400 requests/day), then pay-as-you-go

**Total for small app: ~$0-5/month**

