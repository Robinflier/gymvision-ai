# Render Setup - Stap voor Stap

## Stap 1: Maak GitHub Repository (Als je die nog niet hebt)

### 1.1. Ga naar GitHub
1. Open https://github.com
2. Log in (of maak account aan)

### 1.2. Maak nieuwe repository
1. Klik op **"+"** (rechtsboven) → **"New repository"**
2. Repository name: `gymvision-ai` (of andere naam)
3. Kies **Private** of **Public** (maakt niet uit)
4. **NIET** aanvinken: "Add a README file"
5. Klik **"Create repository"**

### 1.3. Push je code naar GitHub

Open Terminal en voer uit:

```bash
cd /Users/robinflier/Documents/GV_AI

# Verwijder oude remote (als die er is)
git remote remove origin 2>/dev/null || true

# Voeg nieuwe remote toe (vervang JOUW-USERNAME met je GitHub username)
git remote add origin https://github.com/JOUW-USERNAME/gymvision-ai.git

# Commit alle bestanden
git add .
git commit -m "Initial commit - GymVision AI backend"

# Push naar GitHub
git push -u origin main
```

**Let op:** Vervang `JOUW-USERNAME` met je echte GitHub username!

---

## Stap 2: Maak GROQ API Key

### 2.1. Ga naar Groq
1. Open https://console.groq.com
2. Sign up (gratis) of log in
3. Ga naar **"API Keys"** sectie
4. Klik **"Create API Key"**
5. **Kopieer de key** - je hebt hem straks nodig!

---

## Stap 3: Deploy op Render

### 3.1. Ga naar Render Dashboard
1. Je bent al op https://dashboard.render.com
2. Klik op **"Deploy a Web Service"** (eerste kaart met globe icoon)

### 3.2. Connect GitHub
1. Als je nog niet connected bent:
   - Klik **"Connect GitHub"**
   - Autoriseer Render om je repos te zien
   - Selecteer **alle repos** of **specifieke repos**

2. Select je repository:
   - Kies `gymvision-ai` (of de naam die je hebt gekozen)
   - Klik op de repo naam

### 3.3. Configureer de Service

Vul deze velden in:

**Basic Settings:**
- **Name**: `gymvision-ai` (of andere naam)
- **Region**: Kies dichtstbijzijnde (bijv. Frankfurt voor Europa)
- **Branch**: `main` (of `master` als je die gebruikt)
- **Root Directory**: Laat leeg (of `.` als het moet)

**Build & Deploy:**
- **Environment**: `Python 3`
- **Build Command**: 
  ```
  pip install -r requirements.txt
  ```
- **Start Command**: 
  ```
  python app.py
  ```

**Plan:**
- Kies **"Free"** (gratis tier)

### 3.4. Environment Variables

Klik op **"Advanced"** → **"Add Environment Variable"**

Voeg deze toe:

**Variable 1:**
- Key: `GROQ_API_KEY`
- Value: `jouw-groq-api-key-hier` (de key die je in Stap 2 hebt gekopieerd)

**Variable 2:**
- Key: `SECRET_KEY`
- Value: Genereer met deze command in Terminal:
  ```bash
  openssl rand -hex 32
  ```
  Kopieer de output en gebruik die als value

**Variable 3 (Optioneel - voor email):**
- Key: `PORT`
- Value: `5000`
  (Render zet dit automatisch, maar kan handig zijn)

### 3.5. Deploy!

1. Scroll naar beneden
2. Klik **"Create Web Service"**
3. Render begint nu te deployen (duurt 2-5 minuten)

---

## Stap 4: Wacht op Deployment

Je ziet een log van wat er gebeurt:
- ✅ Installing dependencies
- ✅ Building...
- ✅ Starting...

**Wacht tot je ziet:**
- ✅ "Your service is live at https://..."

---

## Stap 5: Kopieer je URL

1. In Render dashboard, zie je je service
2. Bovenaan staat: **"gymvision-ai"** met een URL ernaast
3. De URL is: `https://gymvision-ai.onrender.com` (of vergelijkbaar)
4. **Kopieer deze URL** - je hebt hem nodig!

---

## Stap 6: Test je Backend

Open een nieuwe browser tab en test:

```bash
# Test 1: Check of server draait
curl https://jouw-url.onrender.com/check-auth

# Moet returnen: {"authenticated": false}

# Test 2: Test native login
curl -X POST https://jouw-url.onrender.com/native-login

# Moet returnen: {"success": true, "authenticated": true, ...}
```

Of test in browser:
- Ga naar: `https://jouw-url.onrender.com/check-auth`
- Je zou JSON moeten zien

---

## Stap 7: Update je App

### 7.1. Update app.js

Open `www/app.js` en zoek regel 15 (rond de API_BASE_URL):

```javascript
const API_BASE_URL = window.Capacitor 
    ? 'http://192.168.68.103:5000'  // OUDE URL
    : '';
```

Vervang met:

```javascript
const API_BASE_URL = window.Capacitor 
    ? 'https://jouw-url.onrender.com'  // JOUW RENDER URL HIER
    : '';
```

**Belangrijk:** 
- Gebruik `https://` (niet `http://`)
- Gebruik je volledige Render URL
- Verwijder de `/` aan het einde (als die er is)

### 7.2. Sync naar iOS

```bash
cd /Users/robinflier/Documents/GV_AI
npx cap sync ios
```

---

## Stap 8: Rebuild App in Xcode

1. Open Xcode
2. Stop de app (als die draait)
3. Druk **⌘ + R** om opnieuw te bouwen en te runnen
4. Test Vision chat!

---

## Troubleshooting

### "Build failed"
- Check Render logs (in dashboard)
- Zorg dat `requirements.txt` alle packages heeft
- Check Python versie (moet 3.11+ zijn)

### "Service won't start"
- Check logs in Render dashboard
- Zorg dat `Start Command` correct is: `python app.py`
- Check of `PORT` environment variable wordt gebruikt (is al gefixt in app.py)

### "Can't connect from app"
- Check of URL correct is in `app.js`
- Check of service "Live" is (niet "Sleeping")
- Als service slaapt: eerste request duurt ~30 seconden

### "GROQ API error"
- Check of `GROQ_API_KEY` correct is ingesteld in Render
- Check of je Groq credits hebt

### "CORS error"
- Al gefixt in code, zou automatisch moeten werken

---

## Belangrijke URLs

- **Render Dashboard**: https://dashboard.render.com
- **Je Service**: https://jouw-url.onrender.com
- **Logs**: In Render dashboard → Klik op je service → "Logs" tab

---

## Kosten

**Render Free Tier:**
- ✅ Volledig gratis
- ✅ 750 uur/maand (genoeg voor 24/7)
- ⚠️ Slaapt na 15 minuten inactiviteit
- ✅ Wake-up duurt ~30 seconden

**Totaal: $0/maand** 🎉

---

## Volgende Stappen

1. ✅ Backend deployed op Render
2. ✅ App geconfigureerd met Render URL
3. ✅ Test Vision chat in app
4. ✅ Geniet van je werkende app!

---

## Tips

- **Service slaapt?** Geen probleem - eerste request na slapen duurt ~30 seconden, daarna werkt het normaal
- **Logs bekijken**: In Render dashboard → Je service → "Logs" tab
- **Redeploy**: Bij code changes, push naar GitHub → Render deployt automatisch
- **Custom domain**: Later kun je een eigen domain toevoegen (optioneel)

