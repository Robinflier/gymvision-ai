# Debug in Xcode - Console Logs Bekijken

## Hoe console logs te zien in Xcode:

### 1. Run de app in Xcode
- Build & Run (Cmd+R)
- Wacht tot app start

### 2. Open Debug Console
- In Xcode: **View → Debug Area → Activate Console** (of Cmd+Shift+Y)
- Of klik op het console icoon onderaan in Xcode

### 3. Filter op AI Detect logs
- In de console, type: `AI Detect` in het filter veld
- Of zoek naar: `[AI Detect]`

### 4. Test AI-detect
- Ga naar "Add Exercise"
- Klik "AI-detect"
- Kies een foto
- Check de console voor logs

### 5. Wat je moet zien:
```
[AI Detect] Sending to: https://gymvision-ai.onrender.com/api/recognize-exercise
[AI Detect] File: IMG_1234.jpg 1234567 bytes
[AI Detect] Response status: 200 OK
[AI Detect] Full response: {"exercise":"bench press"}
[AI Detect] Exercise name extracted: bench press
[AI Detect] Looking for match for: bench press
[AI Detect] Match found? Bench Press
```

## Als je errors ziet:
- Network error → Check internet verbinding
- 404/500 error → Backend probleem
- CORS error → CORS configuratie probleem
- Parse error → Response format probleem

## Snelle test:
Voeg tijdelijk dit toe om direct te zien wat er gebeurt:
```javascript
alert('Response: ' + JSON.stringify(data));
```

Dit toont een alert met de volledige response, zodat je direct ziet wat er terugkomt.

