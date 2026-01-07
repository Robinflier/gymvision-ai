# 🔍 Debug: Waarom Gebruikt Het Nog OpenAI?

## ⚠️ Mogelijke Oorzaken:

### **1. Render heeft nieuwe code nog niet gedeployed**
- Check Render Dashboard → Deployments
- Is de laatste deploy klaar? (groen vinkje)
- Zo niet: wacht 2-5 minuten

### **2. HUGGINGFACE_API_TOKEN niet correct gezet**
- Render Dashboard → Environment
- Check of `HUGGINGFACE_API_TOKEN` er staat
- Check of de waarde correct is (moet beginnen met `hf_`)

### **3. Token is leeg of ongeldig**
- Token moet beginnen met `hf_`
- Token moet "Read" permissions hebben
- Check Hugging Face: https://huggingface.co/settings/tokens

### **4. Hugging Face API error (fallback naar OpenAI)**
- Model is loading (eerste call)
- Rate limit bereikt
- API error

---

## 🔍 STAP 1: Check Render Logs

**Ga naar:**
1. https://dashboard.render.com
2. Selecteer je service
3. Klik "Logs"
4. Test AI detect in app
5. Zoek naar deze berichten:

### ✅ **Als Hugging Face werkt:**
```
[DEBUG] Hugging Face caption: 'a person doing bench press'
[DEBUG] Final exercise: 'bench press'
```

### ❌ **Als token niet gezet is:**
```
[ERROR] HUGGINGFACE_API_TOKEN not set
[INFO] Falling back to OpenAI (Hugging Face token not set)
```

### ❌ **Als API error:**
```
[ERROR] Hugging Face API error: 503 - Model is loading...
[INFO] Falling back to OpenAI (Hugging Face API error)
```

---

## 🔍 STAP 2: Check Environment Variable

**In Render Dashboard:**
1. Ga naar je service
2. Klik "Environment"
3. Zoek naar `HUGGINGFACE_API_TOKEN`
4. Check:
   - ✅ Staat het er?
   - ✅ Begint het met `hf_`?
   - ✅ Is het niet leeg?

**Als het er niet staat:**
1. Klik "Add Environment Variable"
2. Key: `HUGGINGFACE_API_TOKEN`
3. Value: `hf_xxxxxxxxxxxxx` (je token)
4. Klik "Save Changes"
5. Render zal automatisch redeployen

---

## 🔍 STAP 3: Check Health Endpoint

**Test:**
```bash
curl https://gymvision-ai.onrender.com/health
```

**Response moet zijn:**
```json
{
  "status": "ok",
  "openai_available": true,
  "groq_available": true,
  "huggingface_available": true  ← Moet TRUE zijn!
}
```

**Als `huggingface_available: false`:**
- Token is niet gezet of leeg
- Fix: Add token in Render Environment

---

## 🔍 STAP 4: Test Direct API Call

**Test Hugging Face direct:**
```bash
curl -X POST https://gymvision-ai.onrender.com/api/recognize-exercise \
  -F "image=@test_image.jpg"
```

**Check Render logs voor:**
- `[DEBUG] Hugging Face caption:` = Werkt!
- `[INFO] Falling back to OpenAI` = Probleem!

---

## ✅ QUICK FIX CHECKLIST

- [ ] Render deploy is klaar (groen vinkje)
- [ ] `HUGGINGFACE_API_TOKEN` staat in Render Environment
- [ ] Token begint met `hf_`
- [ ] Token is niet leeg
- [ ] Health endpoint: `huggingface_available: true`
- [ ] Render logs: Geen `[ERROR] HUGGINGFACE_API_TOKEN not set`

---

## 🚨 MEEST VOORKOMENDE PROBLEEM

**Token niet gezet in Render:**
- Code valt terug op OpenAI
- Logs tonen: `[ERROR] HUGGINGFACE_API_TOKEN not set`

**Oplossing:**
1. Render Dashboard → Environment
2. Add: `HUGGINGFACE_API_TOKEN` = `hf_xxxxxxxxxxxxx`
3. Save → Render redeployt automatisch
4. Wacht 2-5 minuten
5. Test opnieuw

---

*Laatste update: Januari 2026*

