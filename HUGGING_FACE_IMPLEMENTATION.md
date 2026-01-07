# 🤗 Hugging Face Implementation voor AI Exercise Detection

## ⚠️ BELANGRIJK: Image Classification is NIET genoeg!

**Image Classification** geeft alleen algemene labels zoals:
- "gym equipment"
- "bench"
- "dumbbell"

**Maar we hebben nodig:**
- "bench press"
- "squat"
- "deadlift"

## 🎯 BETER: Vision-Language Models

### **Optie 1: BLIP-2 (Image Captioning)** ⭐⭐⭐⭐⭐
**Model:** `Salesforce/blip-image-captioning-base`
- Beschrijft wat er in de afbeelding gebeurt
- Kan "person doing bench press" genereren
- Gratis via Hugging Face Inference API

### **Optie 2: LLaVA (Vision-Language)** ⭐⭐⭐⭐
**Model:** `llava-hf/llava-1.5-7b-hf`
- Kan vragen beantwoorden over afbeeldingen
- Prompt: "What exercise is being performed?"
- Goede accuraatheid

### **Optie 3: Image-to-Text (BLIP)** ⭐⭐⭐⭐
**Model:** `Salesforce/blip-image-captioning-large`
- Beschrijft afbeelding in detail
- Kan oefening identificeren

---

## 🚀 IMPLEMENTATIE STAPPEN

### **Stap 1: Hugging Face Account & Token**

1. **Sign Up:**
   - Ga naar: https://huggingface.co/join
   - Maak gratis account

2. **Get API Token:**
   - Ga naar: https://huggingface.co/settings/tokens
   - Klik "New token"
   - Naam: "GymVision AI"
   - Type: "Read" (genoeg voor Inference API)
   - Copy token (bijv. `hf_xxxxxxxxxxxxx`)

3. **Add to Render:**
   - Ga naar Render Dashboard
   - Environment Variables
   - Add: `HUGGINGFACE_API_TOKEN` = `hf_xxxxxxxxxxxxx`

---

### **Stap 2: Kies Model**

**Aanbeveling: BLIP-2 voor Image Captioning**

**Waarom:**
- Goede accuraatheid
- Beschrijft oefening in detail
- Gratis via Inference API

**Model:** `Salesforce/blip-image-captioning-base`

---

### **Stap 3: Backend Implementatie**

**Update `app.py`:**

```python
import requests

# Add at top of file
HF_API_URL = "https://api-inference.huggingface.co/models/Salesforce/blip-image-captioning-base"
HF_HEADERS = {"Authorization": f"Bearer {os.getenv('HUGGINGFACE_API_TOKEN')}"}

@app.route("/api/recognize-exercise", methods=["POST"])
def recognize_exercise():
    """
    Exercise recognition endpoint: image → exercise name.
    Uses Hugging Face BLIP-2 for image captioning.
    """
    try:
        # Get image file
        file = request.files.get("image")
        if not file:
            print("[ERROR] No file in request")
            return jsonify({"exercise": "unknown exercise"}), 200
        
        # Read image bytes
        image_bytes = file.read()
        if not image_bytes:
            print("[ERROR] Image bytes is empty")
            return jsonify({"exercise": "unknown exercise"}), 200
        
        print(f"[DEBUG] Image size: {len(image_bytes)} bytes")
        
        # Get Hugging Face API token
        hf_token = os.getenv("HUGGINGFACE_API_TOKEN")
        if not hf_token:
            print("[ERROR] HUGGINGFACE_API_TOKEN not set")
            return jsonify({"exercise": "unknown exercise"}), 200
        
        # Call Hugging Face BLIP-2
        headers = {"Authorization": f"Bearer {hf_token}"}
        response = requests.post(
            "https://api-inference.huggingface.co/models/Salesforce/blip-image-captioning-base",
            headers=headers,
            data=image_bytes,
            timeout=30
        )
        
        if response.status_code != 200:
            print(f"[ERROR] Hugging Face API error: {response.status_code}")
            return jsonify({"exercise": "unknown exercise"}), 200
        
        result = response.json()
        
        # Extract caption
        if isinstance(result, list) and len(result) > 0:
            caption = result[0].get("generated_text", "")
        elif isinstance(result, dict):
            caption = result.get("generated_text", "")
        else:
            caption = str(result)
        
        print(f"[DEBUG] Hugging Face caption: '{caption}'")
        
        # Extract exercise name from caption
        # Caption might be: "a person doing bench press" or "bench press exercise"
        exercise_name = extract_exercise_from_caption(caption)
        
        # Clean up exercise name
        exercise_name = exercise_name.lower().strip()
        exercise_name = exercise_name.strip('"\'.,;:!?')
        
        # Remove common phrases
        exercise_name = exercise_name.replace("a person doing ", "")
        exercise_name = exercise_name.replace("person doing ", "")
        exercise_name = exercise_name.replace("doing ", "")
        exercise_name = exercise_name.replace("exercise", "").strip()
        
        print(f"[DEBUG] Extracted exercise: '{exercise_name}'")
        
        return jsonify({"exercise": exercise_name}), 200
        
    except Exception as e:
        print(f"[ERROR] Exercise recognition error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"exercise": "unknown exercise"}), 200

def extract_exercise_from_caption(caption):
    """
    Extract exercise name from BLIP caption.
    Caption examples:
    - "a person doing bench press"
    - "bench press exercise"
    - "a man performing a bench press"
    """
    caption_lower = caption.lower()
    
    # List of common exercise keywords
    exercise_keywords = [
        "bench press", "squat", "deadlift", "bicep curl", "tricep extension",
        "shoulder press", "lat pulldown", "row", "leg press", "leg curl",
        "leg extension", "calf raise", "hip thrust", "pull up", "push up",
        "dumbbell press", "dumbbell fly", "cable crossover", "pec deck",
        "chest press", "incline press", "decline press", "lateral raise",
        "front raise", "rear delt fly", "barbell curl", "hammer curl",
        "tricep pushdown", "overhead extension", "lat raise", "pull down",
        "seated row", "bent over row", "t-bar row", "face pull",
        "leg press", "hack squat", "bulgarian split squat", "lunges",
        "romanian deadlift", "stiff leg deadlift", "good morning",
        "hip thrust", "glute bridge", "cable kickback", "abductor",
        "adductor", "calf raise", "seated calf raise", "donkey calf raise",
        "crunch", "sit up", "leg raise", "plank", "russian twist"
    ]
    
    # Find matching exercise in caption
    for exercise in exercise_keywords:
        if exercise in caption_lower:
            return exercise
    
    # If no match, try to extract first 2-3 words after "doing" or "performing"
    import re
    patterns = [
        r"doing\s+([a-z\s]+?)(?:\s+exercise|\s+with|\.|$)",
        r"performing\s+([a-z\s]+?)(?:\s+exercise|\s+with|\.|$)",
        r"([a-z\s]+?)\s+exercise",
    ]
    
    for pattern in patterns:
        match = re.search(pattern, caption_lower)
        if match:
            extracted = match.group(1).strip()
            # Take first 2-3 words
            words = extracted.split()[:3]
            return " ".join(words)
    
    # Fallback: return first few words of caption
    words = caption_lower.split()[:3]
    return " ".join(words)
```

---

### **Stap 4: Update Requirements**

**Add to `requirements.txt`:**
```
requests>=2.31.0
```

(Al waarschijnlijk aanwezig, maar check het)

---

### **Stap 5: Test**

**Test endpoint:**
```bash
curl -X POST http://localhost:5004/api/recognize-exercise \
  -F "image=@test_image.jpg"
```

**Expected response:**
```json
{"exercise": "bench press"}
```

---

## 🔄 ALTERNATIEF: LLaVA Model (Vraag-Antwoord)

**Als BLIP niet goed genoeg is, gebruik LLaVA:**

```python
# LLaVA kan vragen beantwoorden over afbeeldingen
response = requests.post(
    "https://api-inference.huggingface.co/models/llava-hf/llava-1.5-7b-hf",
    headers=headers,
    json={
        "inputs": {
            "image": base64.b64encode(image_bytes).decode('utf-8'),
            "text": "What exercise is being performed in this image? Respond with only the exercise name."
        }
    }
)
```

---

## 📊 VERGELIJKING

| Model | Type | Accuraatheid | Snelheid | Aanbeveling |
|-------|------|--------------|----------|------------|
| **BLIP-2** | Image Captioning | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ✅ **BESTE** |
| **LLaVA** | Vision-Language | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ✅ Goed alternatief |
| **Image Classification** | Classification | ⭐⭐ | ⭐⭐⭐⭐⭐ | ❌ Te generiek |

---

## 🎯 VOLGENDE STAPPEN

1. **Sign up voor Hugging Face** ✅
2. **Get API token** ✅
3. **Add token to Render** ✅
4. **Implementeer BLIP-2** (code hierboven)
5. **Test met echte images**
6. **Deploy naar Render**

---

*Laatste update: Januari 2026*

