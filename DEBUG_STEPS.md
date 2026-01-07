# Debug: Waarom krijg je "Kon oefening niet identificeren"?

## Stappen om te debuggen:

### 1. Rebuild in Xcode
```bash
cd /Users/robinflier/Documents/GV_AI
npx cap sync ios
```

Dan in Xcode:
- Clean Build Folder (Cmd+Shift+K)
- Rebuild (Cmd+B)
- Run (Cmd+R)

### 2. Open Safari Console
- Safari → Develop → [Your Device] → [Gym Vision AI]
- Open Console tab

### 3. Test AI-detect en check logs
Zoek naar logs die beginnen met `[AI Detect]`:
- `[AI Detect] Sending to:` → welke URL?
- `[AI Detect] Response status:` → wat is de status?
- `[AI Detect] Full response:` → wat komt er terug?
- `[AI Detect] Exercise name extracted:` → wat is de exercise name?

### 4. Mogelijke problemen:

**A. Response is leeg of undefined:**
- Check `[AI Detect] Full response:` log
- Als `data.exercise` undefined is → backend geeft verkeerde response

**B. Exercise name is "unknown exercise":**
- Check Render logs (dashboard.render.com)
- Check of OpenAI API key correct is
- Check of de prompt correct wordt gebruikt

**C. Network error:**
- Check `[AI Detect] Response status:` log
- Als status niet 200 → server error

**D. File upload probleem:**
- Check `[AI Detect] File:` log
- Als file size 0 → file niet correct geselecteerd

### 5. Test Render direct:
```bash
curl -X POST https://gymvision-ai.onrender.com/api/recognize-exercise \
  -F "image=@../images/benchpress.jpg"
```

Expected: `{"exercise":"bench press"}`

Als dit werkt maar de app niet → frontend probleem
Als dit niet werkt → backend probleem

### 6. Check Render Logs
Ga naar Render dashboard → Logs
Zoek naar `[DEBUG]` logs:
- `[DEBUG] OpenAI raw response:` → wat zegt OpenAI?
- `[DEBUG] Final exercise:` → wat wordt teruggegeven?

## Snelle Fix:
Als je nog steeds "unknown exercise" krijgt, kan het zijn dat:
1. De foto echt geen oefening bevat
2. OpenAI geeft een antwoord dat niet goed wordt geparsed
3. Er is een error die wordt gevangen

Check de console logs om te zien wat er precies gebeurt!

