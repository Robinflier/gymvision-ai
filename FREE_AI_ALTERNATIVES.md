# 🆓 Gratis Alternatieven voor AI Exercise Recognition

## 🎯 Opties

### **1. Groq (Al in gebruik!)** ⭐⭐⭐⭐⭐
**Status:** Je gebruikt Groq al voor workout generation!

**Vision Support:**
- ⚠️ **Groq heeft GEEN native vision support** (alleen text)
- ✅ **MAAR:** Je kunt base64 image encoderen en als text prompt sturen
- ✅ **Gratis:** ~14,400 requests/dag (free tier)

**Hoe het werkt:**
```python
# Image → base64 → text prompt → Groq
image_base64 = base64.b64encode(image_bytes).decode('utf-8')
prompt = f"Describe this exercise image: {image_base64}"
# Groq kan dit interpreteren (maar niet optimaal)
```

**Probleem:**
- Groq is niet geoptimaliseerd voor vision
- Accuraatheid kan lager zijn dan OpenAI Vision
- **Maar:** Gratis! ✅

**Aanbeveling:** Test eerst of Groq goed genoeg werkt voor exercise recognition

---

### **2. Hugging Face Inference API** ⭐⭐⭐⭐
**Gratis Tier:**
- **30 requests/minuut** = ~43,200 requests/dag
- **Gratis voor altijd** (met rate limits)

**Vision Models:**
- `google/vit-base-patch16-224` (image classification)
- `microsoft/resnet-50` (object detection)
- `openai/clip-vit-base-patch32` (image-text matching)

**Hoe het werkt:**
```python
import requests

API_URL = "https://api-inference.huggingface.co/models/google/vit-base-patch16-224"
headers = {"Authorization": f"Bearer {HF_TOKEN}"}

def query(image_bytes):
    response = requests.post(API_URL, headers=headers, data=image_bytes)
    return response.json()
```

**Voordelen:**
- ✅ Gratis (30 req/min)
- ✅ Veel verschillende models
- ✅ Goede accuraatheid

**Nadelen:**
- ⚠️ Niet specifiek getraind op exercises
- ⚠️ Moet zelf exercise matching doen
- ⚠️ Rate limits (30/min)

**Kosten:** €0/maand (gratis!)

---

### **3. Replicate** ⭐⭐⭐
**Gratis Tier:**
- **Gratis credits** bij signup
- **Pay-as-you-go** daarna (zeer goedkoop)

**Vision Models:**
- `llava-13b` (vision-language model)
- `blip-2` (image captioning)
- Custom models mogelijk

**Hoe het werkt:**
```python
import replicate

output = replicate.run(
    "yorickvp/llava-13b",
    input={"image": image_url, "prompt": "What exercise is this?"}
)
```

**Voordelen:**
- ✅ Goede vision models
- ✅ Eerste credits gratis
- ✅ Zeer goedkoop daarna (~$0.001 per request)

**Nadelen:**
- ⚠️ Niet volledig gratis (na free credits)
- ⚠️ Maar zeer goedkoop

**Kosten:** €0-5/maand (afhankelijk van gebruik)

---

### **4. Google Cloud Vision API** ⭐⭐⭐
**Free Tier:**
- **1,000 requests/maand** gratis
- Daarna: $1.50 per 1,000 requests

**Features:**
- Image labeling
- Object detection
- Text detection

**Hoe het werkt:**
```python
from google.cloud import vision

client = vision.ImageAnnotatorClient()
response = client.label_detection(image=image)
labels = response.label_annotations
```

**Voordelen:**
- ✅ 1,000 gratis/maand
- ✅ Goede accuraatheid
- ✅ Betrouwbaar (Google)

**Nadelen:**
- ⚠️ Alleen 1,000 gratis/maand
- ⚠️ Daarna betaald
- ⚠️ Niet specifiek voor exercises

**Kosten:** €0-10/maand (bij 100 gebruikers)

---

### **5. AWS Rekognition** ⭐⭐
**Free Tier:**
- **5,000 images/maand** gratis (eerste 12 maanden)
- Daarna: $1.00 per 1,000 images

**Features:**
- Object detection
- Scene detection
- Custom labels mogelijk

**Voordelen:**
- ✅ 5,000 gratis/maand (eerste jaar)
- ✅ Betrouwbaar (AWS)

**Nadelen:**
- ⚠️ Alleen eerste jaar gratis
- ⚠️ Daarna betaald
- ⚠️ Complex setup

**Kosten:** €0 (eerste jaar), daarna €5-10/maand

---

### **6. Local Model (YOLO)** ⭐⭐
**Je hebt al YOLO models!** (`best.pt`, `best1.pt`, etc.)

**Huidige situatie:**
- YOLO models zijn al in codebase
- Maar niet meer gebruikt (vervangen door OpenAI)

**Hoe het werkt:**
```python
from ultralytics import YOLO
model = YOLO("best.pt")
results = model(image_path)
```

**Voordelen:**
- ✅ Volledig gratis (geen API costs)
- ✅ Geen rate limits
- ✅ Privacy (lokaal)

**Nadelen:**
- ⚠️ Kost server resources (RAM/CPU)
- ⚠️ Langzamer dan API calls
- ⚠️ Models moeten getraind worden op exercises
- ⚠️ Je hebt al geprobeerd en vervangen door OpenAI

**Kosten:** €0/maand (maar meer server resources nodig)

---

## 🎯 AANBEVELING

### **Optie 1: Groq (Test eerst!)** ⭐⭐⭐⭐⭐
**Waarom:**
- Je gebruikt Groq al (geen nieuwe dependency)
- Gratis (14,400 requests/dag)
- Eenvoudig te implementeren

**Implementatie:**
```python
# Test of Groq vision werkt (via base64 encoding)
# Als accuraatheid OK is → gebruik Groq
# Als niet → verwijder feature
```

**Kosten:** €0/maand ✅

---

### **Optie 2: Hugging Face** ⭐⭐⭐⭐
**Waarom:**
- Gratis (30 req/min = genoeg)
- Goede accuraatheid
- Veel models beschikbaar

**Implementatie:**
- Sign up voor Hugging Face
- Get API token
- Use inference API

**Kosten:** €0/maand ✅

---

### **Optie 3: Verwijderen** ⭐⭐⭐⭐⭐
**Waarom:**
- Feature wordt weinig gebruikt
- Handmatig selecteren is sneller
- Focus op core features

**Kosten:** €0/maand + simpelere codebase ✅

---

## 📊 VERGELIJKING

| Optie | Kosten | Accuraatheid | Setup | Aanbeveling |
|-------|--------|--------------|-------|------------|
| **Groq** | €0 | ⭐⭐⭐ | Eenvoudig | ✅ Test eerst |
| **Hugging Face** | €0 | ⭐⭐⭐⭐ | Medium | ✅ Goede optie |
| **Replicate** | €0-5 | ⭐⭐⭐⭐ | Medium | ⚠️ Niet volledig gratis |
| **Google Vision** | €0-10 | ⭐⭐⭐⭐⭐ | Complex | ⚠️ Alleen 1k gratis |
| **AWS Rekognition** | €0-10 | ⭐⭐⭐⭐ | Complex | ⚠️ Alleen 1 jaar gratis |
| **YOLO (Local)** | €0 | ⭐⭐⭐ | Complex | ❌ Al geprobeerd |
| **Verwijderen** | €0 | N/A | Eenvoudig | ✅ Beste optie |

---

## 🚀 IMPLEMENTATIE PLAN

### **Stap 1: Test Groq Vision**
1. Probeer Groq met base64 image encoding
2. Test accuraatheid op 10-20 exercise images
3. Als accuraatheid > 70% → gebruik Groq
4. Als accuraatheid < 70% → ga naar Stap 2

### **Stap 2: Test Hugging Face**
1. Sign up voor Hugging Face
2. Test vision model op exercise images
3. Als accuraatheid OK → implementeer
4. Als niet → ga naar Stap 3

### **Stap 3: Verwijderen**
1. Verwijder AI detect feature
2. Focus op core features
3. Simpelere codebase

---

## 💡 CONCLUSIE

**Beste optie:** **Test eerst Groq** (je hebt het al!)

**Als Groq niet werkt:**
- **Optie A:** Hugging Face (gratis, goed)
- **Optie B:** Verwijderen (simpelste, beste UX)

**Mijn aanbeveling:** Test Groq eerst, als het niet goed genoeg is → **verwijderen**. Feature wordt toch weinig gebruikt en handmatig is sneller.

---

*Laatste update: Januari 2026*

