# Testing AI Exercise Recognition

## Backend Endpoint: `/api/recognize-exercise`

### Status
✅ Backend endpoint volledig herschreven - simpel en clean
✅ Test script aangemaakt: `test_recognize_exercise.py`

### Testen

1. **Start Flask server:**
   ```bash
   cd /Users/robinflier/Documents/GV_AI
   PORT=5001 python3 app.py
   ```

2. **Zorg dat OPENAI_API_KEY is ingesteld:**
   ```bash
   export OPENAI_API_KEY="sk-..."
   ```

3. **Test met test script:**
   ```bash
   python3 test_recognize_exercise.py ../images/benchpress.jpg
   ```

4. **Of test met curl:**
   ```bash
   curl -X POST http://localhost:5001/api/recognize-exercise \
     -F "image=@../images/benchpress.jpg"
   ```

### Expected Response
```json
{"exercise": "bench press"}
```

of

```json
{"exercise": "unknown exercise"}
```

### Implementatie Status

- [x] Backend endpoint herschreven
- [x] Test script gemaakt
- [ ] Backend getest met echte API key
- [ ] Frontend implementatie gecontroleerd
- [ ] End-to-end test in app

