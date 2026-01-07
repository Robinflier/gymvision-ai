# Deploy naar Render

## Status
- ✅ Nieuwe code is klaar (lokaal werkt het)
- ⏳ Moet naar Render worden gedeployed

## Stappen

### 1. Commit de wijzigingen
```bash
cd /Users/robinflier/Documents/GV_AI
git add app.py static/app.js templates/index.html
git commit -m "Fix AI exercise recognition - use same pattern as vision-detect"
```

### 2. Push naar GitHub
```bash
git push origin main
```

### 3. Render deployt automatisch
- Render detecteert de push automatisch
- Deploy start binnen 1-2 minuten
- Check Render dashboard voor status

### 4. Test na deploy
```bash
curl -X POST https://gymvision-ai.onrender.com/api/recognize-exercise \
  -F "image=@../images/benchpress.jpg"
```

Expected: `{"exercise":"bench press"}` (of andere oefening)

## Belangrijke bestanden die zijn aangepast:
- `app.py` - `/api/recognize-exercise` endpoint (nieuwe simpele versie)
- `static/app.js` - Frontend AI-detect code (vereenvoudigd)
- `templates/index.html` - Geen wijzigingen nodig

## Let op:
- Render deployt automatisch na git push
- Deploy duurt meestal 2-5 minuten
- Test altijd na deploy om te bevestigen dat het werkt

