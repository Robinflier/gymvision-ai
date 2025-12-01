# Free Backend Options

Railway heeft geen gratis tier meer. Hier zijn **gratis alternatieven**:

---

## Optie 1: Render (Gratis - Aanbevolen)

### ✅ Gratis Tier:
- **Gratis** voor altijd
- 750 uur/maand (genoeg voor 24/7)
- Slaapt na 15 minuten inactiviteit (wake-up duurt ~30 seconden)
- Perfect voor kleine apps

### Setup:
1. Ga naar https://render.com
2. Sign up met GitHub (gratis)
3. Klik "New" → "Web Service"
4. Connect je GitHub repo
5. Settings:
   - **Name**: `gymvision-ai`
   - **Environment**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `python app.py`
   - **Port**: `5000`
6. Add Environment Variables:
   - `GROQ_API_KEY`: je Groq key
   - `SECRET_KEY`: `openssl rand -hex 32`
7. Klik "Create Web Service"

**URL**: `https://gymvision-ai.onrender.com`

---

## Optie 2: Fly.io (Gratis)

### ✅ Gratis Tier:
- **3 gratis VMs**
- 3GB storage per VM
- 160GB outbound data/maand
- Perfect voor kleine apps

### Setup:
```bash
# Installeer Fly CLI
curl -L https://fly.io/install.sh | sh

# Login
fly auth login

# In je project folder
cd /Users/robinflier/Documents/GV_AI
fly launch

# Set secrets
fly secrets set GROQ_API_KEY=your-key
fly secrets set SECRET_KEY=$(openssl rand -hex 32)
```

**URL**: `https://gymvision-ai.fly.dev`

---

## Optie 3: PythonAnywhere (Gratis)

### ✅ Gratis Tier:
- **Gratis** account
- 1 web app
- 512MB storage
- Beperkte CPU tijd
- Goed voor testing

### Setup:
1. Ga naar https://www.pythonanywhere.com
2. Maak gratis account
3. Upload je code via Files tab
4. Maak Web app in Web tab
5. Set environment variables
6. Start app

**URL**: `https://jouwusername.pythonanywhere.com`

---

## Optie 4: Replit (Gratis)

### ✅ Gratis Tier:
- **Gratis** voor altijd
- Onbeperkte repls
- Community support
- Goed voor prototyping

### Setup:
1. Ga naar https://replit.com
2. Sign up (gratis)
3. "Create Repl" → "Import from GitHub"
4. Select je repo
5. Set environment variables
6. Run

**URL**: `https://jouw-repl-name.repl.co`

---

## Vergelijking

| Service | Gratis? | Slaapt? | Wake-up | Best voor |
|---------|---------|---------|---------|-----------|
| **Render** | ✅ Ja | ⚠️ Na 15min | ~30 sec | **Aanbevolen** |
| **Fly.io** | ✅ Ja | ❌ Nee | Instant | Productie |
| **PythonAnywhere** | ✅ Ja | ⚠️ Beperkt | Variabel | Testing |
| **Replit** | ✅ Ja | ⚠️ Soms | Variabel | Prototyping |

---

## Mijn Aanbeveling: **Render**

**Waarom Render:**
- ✅ Volledig gratis
- ✅ Makkelijk te gebruiken
- ✅ Goede documentatie
- ✅ Automatische deployments
- ⚠️ Slaapt na 15 min (maar wake-up is snel)

**Voor jouw app:**
- Vision chat wordt gebruikt → app blijft wakker
- Als niemand gebruikt → slaapt (bespaart resources)
- Eerste request na slapen → ~30 seconden wachten, daarna werkt het

---

## Quick Start met Render

1. **Push code naar GitHub** (als nog niet gedaan):
   ```bash
   cd /Users/robinflier/Documents/GV_AI
   git add .
   git commit -m "Add backend for deployment"
   git push
   ```

2. **Ga naar Render**: https://render.com
3. **Sign up** met GitHub
4. **New Web Service** → Select je repo
5. **Settings**:
   - Build: `pip install -r requirements.txt`
   - Start: `python app.py`
6. **Environment Variables**:
   - `GROQ_API_KEY`
   - `SECRET_KEY`
7. **Deploy!**

8. **Update app.js** met Render URL:
   ```javascript
   const API_BASE_URL = window.Capacitor 
       ? 'https://gymvision-ai.onrender.com'
       : '';
   ```

9. **Sync**: `npx cap sync ios`

---

## Kosten: **$0/maand** 🎉

Alle opties zijn gratis voor jouw gebruik!

