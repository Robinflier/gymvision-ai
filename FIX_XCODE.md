# Fix: AI-detect werkt niet in Xcode

## Probleem
- ✅ Werkt lokaal (localhost:5004)
- ❌ Werkt niet in Xcode/iOS app

## Oorzaak
De iOS app gebruikt `window.BACKEND_URL = "https://gymvision-ai.onrender.com"` (Render), niet localhost.

## Oplossingen

### Optie 1: Deploy naar Render (Aanbevolen voor productie)
1. Push de nieuwe code naar GitHub
2. Render zal automatisch deployen
3. Test in app - zou moeten werken

### Optie 2: Lokale testing met iOS Simulator
Voor testing op iOS Simulator kun je tijdelijk localhost gebruiken:

**Pas aan in `templates/index.html`:**
```javascript
// Voor lokale testing (alleen simulator):
window.BACKEND_URL = "http://localhost:5004";

// Of gebruik je Mac's IP adres (voor echte iPhone):
// window.BACKEND_URL = "http://192.168.1.XXX:5004";
```

Dan:
```bash
cd /Users/robinflier/Documents/GV_AI
npx cap sync ios
```

**Let op:** 
- `localhost` werkt alleen in iOS Simulator
- Voor echte iPhone: gebruik je Mac's IP adres (bijv. `192.168.1.100:5004`)
- Zorg dat iPhone en Mac opzelfde WiFi zitten

### Optie 3: Test eerst in web browser
1. Start server: `PORT=5004 python3 app.py`
2. Open: `http://localhost:5004`
3. Test AI-detect in browser
4. Als dat werkt, deploy naar Render

## Check Render Status
Test of Render backend werkt:
```bash
curl -X POST https://gymvision-ai.onrender.com/api/recognize-exercise \
  -F "image=@../images/benchpress.jpg"
```

Als dit werkt → Render heeft de nieuwe code
Als dit niet werkt → Deploy naar Render nodig

