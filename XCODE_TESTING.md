# Xcode Testing Guide

## ✅ Alles is klaar!

- Backend endpoint werkt ✅
- Frontend code gesynct ✅
- Capacitor iOS gesynct ✅

## Testen in Xcode

### Stap 1: Open Xcode
```bash
cd /Users/robinflier/Documents/GV_AI/ios
open App.xcworkspace
```

### Stap 2: Build & Run
- Selecteer je device/simulator
- Klik op ▶️ Run (of Cmd+R)

### Stap 3: Test AI-detect
1. Ga naar "Add Exercise"
2. Klik "AI-detect"
3. Upload een foto of maak een foto
4. Check of de oefening wordt herkend

## Backend URL Configuratie

### Voor Render (Productie):
```javascript
window.BACKEND_URL = "https://gymvision-ai.onrender.com";
```
✅ Dit staat al ingesteld in `index.html`

### Voor Lokale Testing (localhost:5004):
Als je lokaal wilt testen, pas aan in `templates/index.html`:
```javascript
window.BACKEND_URL = "http://localhost:5004";
```

Dan:
1. Sync opnieuw: `npx cap sync ios`
2. Rebuild in Xcode

**Let op:** Voor lokale testing moet je iPhone/iPad op hetzelfde WiFi netwerk zitten als je Mac, en je moet het lokale IP adres gebruiken (niet localhost).

## Troubleshooting

**"Failed to fetch" error:**
- Check of backend draait (Render of lokaal)
- Check of `BACKEND_URL` correct is
- Check browser console voor details

**"Unknown exercise" altijd:**
- Check of `OPENAI_API_KEY` is ingesteld op backend
- Check backend logs voor errors

**Foto upload werkt niet:**
- Check camera permissions in iOS settings
- Check of file input correct is ingesteld (is al gedaan ✅)

