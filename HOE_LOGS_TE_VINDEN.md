# Waar vind je de Debug Logs?

## 1. Backend Logs (Render) - Voor `[DEBUG]` logs van de server

### Stappen:
1. Ga naar: **https://dashboard.render.com**
2. Log in met je account
3. Klik op je service: **"gymvision-ai"**
4. In de linker sidebar, klik op **"Logs"**
5. Je ziet nu alle logs van je backend

### Wat je ziet:
```
[DEBUG] File received: IMG_1234.jpg, content_type: image/jpeg
[DEBUG] Image size: 1234567 bytes
[DEBUG] OpenAI raw response: 'bench press'
[DEBUG] Final exercise: 'bench press'
```

### Tijdens testen:
- Test AI-detect in je app
- Ga direct naar Render logs
- Scroll naar beneden voor de nieuwste logs
- Zoek naar `[DEBUG]` of `[ERROR]`

---

## 2. Frontend Logs (Xcode Console) - Voor `[AI Detect]` logs

### Stappen:
1. Open Xcode
2. Run je app (Cmd+R)
3. In Xcode, klik op: **View → Debug Area → Activate Console** (of druk **Cmd+Shift+Y**)
4. Je ziet nu de console onderaan in Xcode

### Wat je ziet:
```
[AI Detect] Sending to: https://gymvision-ai.onrender.com/api/recognize-exercise
[AI Detect] File: IMG_1234.jpg 1234567 bytes
[AI Detect] Response status: 200 OK
[AI Detect] Full response: {"exercise":"bench press"}
[AI Detect] Exercise name extracted: bench press
```

### Filteren:
- In de console, type `AI Detect` in het filter veld
- Of type `DEBUG` om alleen debug logs te zien

---

## 3. Safari Console (Alternatief voor Xcode)

Als je de app in Safari/iOS Simulator test:

1. Open Safari
2. Ga naar: **Develop → [Your Device] → [Gym Vision AI]**
3. Klik op **Console** tab
4. Je ziet alle JavaScript logs daar

---

## Quick Check:

### Test dit nu:
1. Test AI-detect in je app
2. Check **Xcode Console** (Cmd+Shift+Y) → zie je `[AI Detect]` logs?
3. Check **Render Dashboard → Logs** → zie je `[DEBUG]` logs?

Als je beide ziet → alles werkt, check wat de logs zeggen
Als je geen logs ziet → er is een probleem met de logging of de code draait niet

