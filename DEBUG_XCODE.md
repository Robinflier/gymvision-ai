# Debug: AI-detect werkt niet in Xcode

## ✅ Status Check

- ✅ Render backend werkt: `{"exercise":"bench press"}`
- ✅ Frontend code is correct
- ✅ Capacitor gesynct

## Debugging Steps

### 1. Check Browser Console in Xcode
- Open Xcode
- Run app
- Open Safari → Develop → [Your Device] → [App Name]
- Check Console voor errors

### 2. Check Network Requests
In Safari Developer Tools:
- Network tab
- Filter op "recognize-exercise"
- Check of request wordt verstuurd
- Check response status en body

### 3. Mogelijke Problemen

**A. CORS Error:**
- Check of CORS headers correct zijn (zou moeten werken)
- Check console voor CORS errors

**B. Network Error:**
- Check of app internet heeft
- Check of Render URL bereikbaar is

**C. Response Parsing:**
- Check of response correct wordt geparsed
- Check console logs voor "AI detect response:"

**D. File Upload:**
- Check of file correct wordt verstuurd
- Check FormData in Network tab

### 4. Test Commands

Test Render endpoint direct:
```bash
curl -X POST https://gymvision-ai.onrender.com/api/recognize-exercise \
  -F "image=@../images/benchpress.jpg"
```

Expected: `{"exercise":"bench press"}`

### 5. Frontend Debugging

Voeg extra logging toe in `static/app.js`:
```javascript
console.log('Sending to:', apiUrl);
console.log('File:', file);
console.log('Response:', data);
```

### 6. Check iOS Permissions
- Camera permission
- Photo library permission
- Network permission

## Quick Fixes

1. **Rebuild in Xcode:**
   - Clean Build Folder (Cmd+Shift+K)
   - Rebuild (Cmd+B)
   - Run (Cmd+R)

2. **Re-sync Capacitor:**
   ```bash
   cd /Users/robinflier/Documents/GV_AI
   npx cap sync ios
   ```

3. **Check if www/ is up to date:**
   ```bash
   ls -la www/static/app.js
   ```

