# 🔍 Hoe Check Je Of Hugging Face Wordt Gebruikt?

## ✅ Methode 1: Render Logs (Beste Methode)

**Stappen:**
1. Ga naar: https://dashboard.render.com
2. Selecteer je service (`gymvision-ai`)
3. Klik op **"Logs"** tab
4. Test AI detect feature in je app
5. Zoek in logs naar:

### ✅ **Als Hugging Face wordt gebruikt:**
```
[DEBUG] Hugging Face caption: 'a person doing bench press'
[DEBUG] Final exercise: 'bench press'
```

### ⚠️ **Als het terugvalt op OpenAI:**
```
[ERROR] HUGGINGFACE_API_TOKEN not set
[INFO] Falling back to OpenAI (Hugging Face token not set)
```

Of:
```
[ERROR] Hugging Face API error: 503 - Model is loading...
[INFO] Falling back to OpenAI (Hugging Face API error)
```

---

## ✅ Methode 2: Health Endpoint

**Test endpoint:**
```bash
curl https://gymvision-ai.onrender.com/health
```

**Response:**
```json
{
  "status": "ok",
  "openai_available": true,
  "groq_available": true,
  "huggingface_available": true  ← Dit moet true zijn!
}
```

**Als `huggingface_available: false`:**
- Token is niet gezet in Render
- Check Render Dashboard → Environment → `HUGGINGFACE_API_TOKEN`

---

## ✅ Methode 3: Test Direct API Call

**Test met curl:**
```bash
curl -X POST https://gymvision-ai.onrender.com/api/recognize-exercise \
  -F "image=@test_image.jpg"
```

**Als Hugging Face werkt:**
- Response: `{"exercise": "bench press"}` (of andere oefening)
- Check Render logs voor: `[DEBUG] Hugging Face caption:`

**Als het terugvalt op OpenAI:**
- Check Render logs voor: `[INFO] Falling back to OpenAI`

---

## ✅ Methode 4: Response Tijd

**Hugging Face:**
- Eerste call: 10-30 seconden (model loading)
- Daarna: 1-3 seconden

**OpenAI:**
- Altijd: 2-5 seconden

**Als eerste call > 10 seconden duurt:**
- Waarschijnlijk Hugging Face (model loading)
- Check logs om zeker te zijn

---

## 🔍 Wat Te Zoeken In Logs

### **Hugging Face Success:**
```
[DEBUG] File received: image.jpg, content_type: image/jpeg
[DEBUG] Image size: 123456 bytes
[DEBUG] Hugging Face caption: 'a person doing bench press'
[DEBUG] Final exercise: 'bench press'
```

### **Hugging Face Error (Fallback naar OpenAI):**
```
[ERROR] HUGGINGFACE_API_TOKEN not set
[INFO] Falling back to OpenAI (Hugging Face token not set)
```

Of:
```
[ERROR] Hugging Face API error: 503 - Model is loading...
[INFO] Falling back to OpenAI (Hugging Face API error)
```

### **OpenAI Direct (Geen Fallback):**
```
[DEBUG] OpenAI raw response: 'bench press'
[DEBUG] Final exercise: 'bench press'
```

---

## ⚠️ Veelvoorkomende Problemen

### **1. Token Niet Gezet:**
```
[ERROR] HUGGINGFACE_API_TOKEN not set
```
**Oplossing:**
- Render Dashboard → Environment
- Add: `HUGGINGFACE_API_TOKEN` = `hf_xxxxxxxxxxxxx`

### **2. Model Is Loading (Eerste Call):**
```
[ERROR] Hugging Face API error: 503 - Model is loading...
```
**Oplossing:**
- Wacht 30-60 seconden
- Probeer opnieuw
- Model wordt automatisch geladen

### **3. Rate Limit:**
```
[ERROR] Hugging Face API error: 429 - Rate limit exceeded
```
**Oplossing:**
- Wacht 1 minuut
- Free tier: 30 requests/minuut
- Probeer opnieuw

---

## ✅ Quick Check Checklist

- [ ] Health endpoint: `huggingface_available: true`
- [ ] Render logs: `[DEBUG] Hugging Face caption:` (niet `[INFO] Falling back`)
- [ ] Response tijd: Eerste call 10-30 sec, daarna 1-3 sec
- [ ] Geen `[ERROR] HUGGINGFACE_API_TOKEN not set` in logs

---

*Laatste update: Januari 2026*

