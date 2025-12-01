# Backend Deployment Guide - Permanente Server Setup

Om Vision chat altijd te laten werken, moet je de backend server deployen naar een cloud service. Hier zijn de beste opties:

## Optie 1: Railway (Aanbevolen - Gratis tier)

### Stap 1: Maak Railway account
1. Ga naar https://railway.app
2. Sign up met GitHub
3. Klik "New Project"

### Stap 2: Deploy Flask app
1. Klik "Deploy from GitHub repo"
2. Selecteer je GV_AI repository
3. Railway detecteert automatisch Python
4. Set environment variables:
   - `GROQ_API_KEY`: Je Groq API key
   - `SECRET_KEY`: Een random secret (bijv. `openssl rand -hex 32`)

### Stap 3: Update Capacitor config
1. Railway geeft je een URL zoals: `https://gymvision-ai.up.railway.app`
2. Update `www/app.js` regel 15:
   ```javascript
   const API_BASE_URL = window.Capacitor 
       ? 'https://gymvision-ai.up.railway.app'  // Jouw Railway URL
       : '';
   ```
3. Run: `npx cap sync ios`

---

## Optie 2: Render (Gratis tier)

### Stap 1: Maak Render account
1. Ga naar https://render.com
2. Sign up met GitHub

### Stap 2: Maak nieuwe Web Service
1. Klik "New" → "Web Service"
2. Connect je GitHub repo
3. Settings:
   - **Name**: `gymvision-ai`
   - **Environment**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `python app.py`
   - **Port**: `5000`

### Stap 3: Environment Variables
- `GROQ_API_KEY`: Je Groq API key
- `SECRET_KEY`: Random secret

### Stap 4: Update Capacitor config
1. Render geeft URL: `https://gymvision-ai.onrender.com`
2. Update `www/app.js` regel 15 met deze URL
3. Run: `npx cap sync ios`

---

## Optie 3: Heroku (Betaald na gratis tier)

### Stap 1: Installeer Heroku CLI
```bash
brew tap heroku/brew && brew install heroku
```

### Stap 2: Login en deploy
```bash
cd /Users/robinflier/Documents/GV_AI
heroku login
heroku create gymvision-ai
heroku config:set GROQ_API_KEY=your-key
heroku config:set SECRET_KEY=$(openssl rand -hex 32)
git push heroku main
```

### Stap 3: Update Capacitor config
1. Heroku geeft URL: `https://gymvision-ai.herokuapp.com`
2. Update `www/app.js` regel 15
3. Run: `npx cap sync ios`

---

## Vereisten voor alle opties

### 1. requirements.txt maken
```bash
cd /Users/robinflier/Documents/GV_AI
pip3 freeze > requirements.txt
```

Of maak handmatig:
```
Flask==3.0.0
flask-login==0.6.3
flask-mail==0.10.0
flask-cors==4.0.0
werkzeug==3.0.1
groq==0.4.0
ultralytics==8.0.0
```

### 2. Procfile (voor Heroku/Railway)
Maak `Procfile` in project root:
```
web: python app.py
```

### 3. .gitignore
Zorg dat `.gitignore` bevat:
```
*.db
__pycache__/
*.pyc
.env
```

---

## Na Deployment

1. **Test de backend**:
   ```bash
   curl https://jouw-url.com/check-auth
   ```

2. **Update app.js**:
   - Vervang `http://192.168.68.103:5000` met je deployed URL
   - Run `npx cap sync ios`

3. **Rebuild app in Xcode**

---

## Lokaal Testen (Voor Development)

Als je lokaal wilt testen:

1. **Start server**:
   ```bash
   ./START_SERVER.sh
   ```

2. **Update app.js regel 15**:
   ```javascript
   const API_BASE_URL = window.Capacitor 
       ? 'http://192.168.68.103:5000'  // Je Mac's IP
       : '';
   ```

3. **Zorg dat iPhone en Mac opzelfde WiFi zitten**

---

## Troubleshooting

**"Failed to get response"**:
- Check of backend server draait
- Check of URL correct is in app.js
- Check CORS is enabled (is al gedaan)

**"Authentication failed"**:
- Auto-login zou automatisch moeten werken
- Check of `/native-login` endpoint werkt

**"GROQ API error"**:
- Zorg dat GROQ_API_KEY is ingesteld
- Check of je Groq credits hebt

