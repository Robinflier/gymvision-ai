# Capacitor Backend Setup

For the AI workout feature to work in Capacitor (iOS/Android), you need to:

## 1. Deploy Your Flask Backend

Deploy your Flask app (with `app.py`) to a hosting service like:
- **Render** (recommended): https://render.com
- **Railway**: https://railway.app
- **Heroku**: https://heroku.com
- **PythonAnywhere**: https://pythonanywhere.com

Make sure your deployed backend has:
- ✅ `GROQ_API_KEY` environment variable set
- ✅ `SUPABASE_URL` and `SUPABASE_ANON_KEY` environment variables set
- ✅ All routes working: `/api/vision-workout`, `/chat`, `/predict`, `/exercise-info`, `/exercises`

## 2. Set BACKEND_URL in index.html

After deploying, update `www/index.html`:

```html
<script>
	// ... existing Supabase config ...
	
	// Backend API URL - REQUIRED for Capacitor/iOS
	// Set this to your deployed Flask backend URL
	window.BACKEND_URL = "https://your-app.onrender.com"; // Replace with your actual URL
</script>
```

**Example:**
- If your Render URL is: `https://gymvision-ai.onrender.com`
- Set: `window.BACKEND_URL = "https://gymvision-ai.onrender.com";`

## 3. Rebuild Capacitor App

After updating `BACKEND_URL`:
1. Save `www/index.html`
2. In Xcode: Product → Clean Build Folder (Cmd+Shift+K)
3. Rebuild and run the app

## 4. Test

1. Open the Vision chat
2. Type: "Create a 5 exercise push workout"
3. Click "Send"
4. It should now connect to your deployed backend and generate the workout!

---

**Note:** The backend URL is only needed for AI features (Vision chat, workout generation). All other features (exercises, workouts, progress) work offline with hardcoded data.

