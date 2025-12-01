# Backend Server Setup voor AI Workout

Om AI Workout te gebruiken in de native app, heb je een backend server nodig. Hier zijn de opties:

## Optie 1: Lokaal Netwerk (Voor Testen)

### Stap 1: Vind je Mac's IP adres
```bash
# In Terminal, voer uit:
ifconfig | grep "inet " | grep -v 127.0.0.1
```
Je krijgt iets als: `inet 192.168.1.100`

### Stap 2: Update Capacitor Config
Pas `capacitor.config.json` aan:
```json
{
  "server": {
    "url": "http://192.168.1.100:5000",
    "cleartext": true
  }
}
```
(Vervang `192.168.1.100` met jouw Mac's IP adres)

### Stap 3: Start Flask Server
```bash
cd /Users/robinflier/Documents/GV_AI
python3 app.py
```

### Stap 4: Sync Capacitor
```bash
npx cap sync ios
```

**Let op:** Je iPhone en Mac moeten op hetzelfde WiFi netwerk zitten!

---

## Optie 2: ngrok (Publieke URL)

### Stap 1: Installeer ngrok
```bash
brew install ngrok
# Of download van https://ngrok.com
```

### Stap 2: Start Flask Server
```bash
cd /Users/robinflier/Documents/GV_AI
python3 app.py
```

### Stap 3: Start ngrok in een nieuwe terminal
```bash
ngrok http 5000
```

Je krijgt een URL zoals: `https://abc123.ngrok.io`

### Stap 4: Update Capacitor Config
```json
{
  "server": {
    "url": "https://abc123.ngrok.io",
    "cleartext": false
  }
}
```

### Stap 5: Sync Capacitor
```bash
npx cap sync ios
```

---

## Optie 3: Deploy naar Cloud (Productie)

### Railway (Aanbevolen - Gratis tier)
1. Ga naar https://railway.app
2. Maak account en nieuw project
3. Connect GitHub repo
4. Deploy Flask app
5. Update Capacitor config met Railway URL

### Render
1. Ga naar https://render.com
2. Maak nieuwe Web Service
3. Connect GitHub repo
4. Build command: `pip install -r requirements.txt`
5. Start command: `python app.py`
6. Update Capacitor config met Render URL

---

## Vereisten

1. **GROQ API Key** (voor AI chat):
   ```bash
   export GROQ_API_KEY="jouw-api-key"
   ```
   Of voeg toe aan `.env` file

2. **Python dependencies**:
   ```bash
   pip install flask flask-login flask-mail groq
   ```

3. **Database** wordt automatisch aangemaakt bij eerste run

---

## Testen

Na setup, test of de backend werkt:
```bash
curl http://localhost:5000/check-auth
```

Als je een response krijgt, werkt de server!

