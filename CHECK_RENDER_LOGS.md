# Check Render Logs voor Debugging

## Het probleem:
Je krijgt `{"exercise": "unknown exercise"}` terug, maar we weten niet waarom.

## Oplossing: Check Render Logs

### 1. Ga naar Render Dashboard
- https://dashboard.render.com
- Selecteer je service "gymvision-ai"
- Klik op "Logs" in de sidebar

### 2. Test AI-detect opnieuw
- In je app, test AI-detect
- Ga direct naar Render logs

### 3. Zoek naar deze logs:
```
[DEBUG] File received: ...
[DEBUG] Image size: ... bytes
[DEBUG] OpenAI raw response: '...'
[DEBUG] Final exercise: '...'
```

### 4. Wat te checken:

**A. Als je ziet:**
```
[ERROR] No file in request
```
→ Foto wordt niet correct verstuurd vanuit de app

**B. Als je ziet:**
```
[ERROR] Image bytes is empty
```
→ Foto is leeg of corrupt

**C. Als je ziet:**
```
[DEBUG] OpenAI raw response: 'unknown exercise'
```
→ OpenAI geeft daadwerkelijk "unknown exercise" terug
→ Dit betekent dat de foto echt geen oefening bevat, of de prompt werkt niet goed

**D. Als je ziet:**
```
[DEBUG] Final exercise: 'unknown exercise'
```
→ Check wat de raw response was

## Snelle Fix:
Als OpenAI altijd "unknown exercise" teruggeeft, kunnen we:
1. De prompt nog agressiever maken
2. Een fallback toevoegen die altijd iets teruggeeft
3. Checken of de foto wel correct wordt verstuurd

## Test met verschillende foto's:
- Probeer een duidelijke foto van een bench press
- Probeer een foto van een persoon die een oefening doet
- Check of de logs verschillen

