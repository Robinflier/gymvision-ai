# Quick Test Guide - Exercise Recognition

## Probleem: 403 Forbidden of Not Found

Dit betekent dat de oude versie van de app draait zonder de nieuwe endpoint.

## Oplossing 1: Server opnieuw starten (lokaal testen)

```bash
# Stop de oude server (als die draait)
kill $(lsof -ti:5000) 2>/dev/null

# Start de nieuwe server
cd /Users/robinflier/Documents/GV_AI
python3 app.py
```

In een **nieuwe terminal**:
```bash
# Test de endpoint
curl -X POST http://localhost:5000/api/recognize-exercise \
  -F "image=@/Users/robinflier/Documents/images/benchpress.jpg"
```

## Oplossing 2: Deploy naar Render (aanbevolen)

```bash
cd /Users/robinflier/Documents/GV_AI

# Commit en push naar Git
git add app.py
git commit -m "Add /api/recognize-exercise endpoint"
git push

# Wacht 2-5 minuten voor Render deploy
# Test dan met je echte Render URL:
curl -X POST https://jouw-echte-app.onrender.com/api/recognize-exercise \
  -F "image=@/Users/robinflier/Documents/images/benchpress.jpg"
```

## Verwachte response:
```json
{
  "exercise": "bench press"
}
```

## Troubleshooting:

### "Not Found" op Render
- Code is nog niet gedeployed
- Check Render dashboard → Deployments
- Wacht tot deploy klaar is (groen vinkje)

### 403 Forbidden lokaal
- Oude server draait nog
- Stop en herstart de server
- Of gebruik een andere poort: `PORT=5001 python3 app.py`

### "OpenAI not available"
- Check of `OPENAI_API_KEY` environment variable is ingesteld
- Op Render: Dashboard → Environment → Check `OPENAI_API_KEY`

