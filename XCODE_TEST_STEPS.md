# Xcode Testen - Stappen

## ✅ Na Render Deploy:

### Stap 1: Sync Capacitor (www folder updaten)
```bash
cd /Users/robinflier/Documents/GV_AI

# Kopieer de nieuwe static/app.js naar www
cp static/app.js www/static/app.js

# Of sync alles met Capacitor (als je Capacitor CLI hebt)
npx cap sync ios
```

### Stap 2: Open Xcode
```bash
# Open het iOS project
open ios/App/App.xcworkspace
```

**⚠️ Belangrijk:** Open `.xcworkspace` (niet `.xcodeproj`)!

### Stap 3: Test in Xcode

1. **Selecteer een simulator of device:**
   - Kies een iPhone simulator (bijv. iPhone 15 Pro)
   - Of verbind een fysiek iOS device

2. **Build en Run:**
   - Klik op de ▶️ (Play) knop
   - Of druk `Cmd + R`

3. **Test de AI-detect functie:**
   - Open de app
   - Ga naar een workout
   - Klik op "+ Add Exercise"
   - Klik op "AI-detect"
   - Upload een foto van een oefening
   - De oefening wordt herkend en je kunt deze toevoegen

## 🔧 Troubleshooting:

### Backend URL niet bereikbaar
- Check of `window.BACKEND_URL` is ingesteld in de iOS app
- Default is: `https://gymvision-ai.onrender.com`
- Check of de Render deploy klaar is

### CORS errors
- De backend heeft CORS al geconfigureerd voor alle origins
- Als je errors ziet, check de Render logs

### Foto upload werkt niet
- Check of Camera permissions zijn ingesteld in Info.plist
- Test eerst met een foto uit de galerij

## 📱 Test Checklist:

- [ ] Render deploy is klaar (groen vinkje)
- [ ] www/static/app.js is geüpdatet
- [ ] Xcode project is geopend (.xcworkspace)
- [ ] Simulator/device is geselecteerd
- [ ] App is gebuild en draait
- [ ] AI-detect knop werkt
- [ ] Foto upload werkt
- [ ] Oefening wordt herkend
- [ ] Oefening kan worden toegevoegd aan workout

