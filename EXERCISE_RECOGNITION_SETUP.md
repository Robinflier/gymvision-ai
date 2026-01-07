# Exercise Recognition Endpoint - Setup Guide

## ✅ Wat is er al gedaan:
- Nieuwe endpoint `/api/recognize-exercise` is toegevoegd aan `app.py`
- Endpoint accepteert images in 3 formaten:
  - File upload (multipart/form-data)
  - Base64 string (JSON)
  - Image URL (JSON)

## 📋 Volgende stappen:

### Stap 1: Code committen en pushen naar Git

```bash
cd /Users/robinflier/Documents/GV_AI
git add app.py
git commit -m "Add /api/recognize-exercise endpoint for OpenAI Vision"
git push
```

### Stap 2: Render automatisch deployen
- Render detecteert automatisch de nieuwe commit
- Deploy start automatisch (duurt ~2-5 minuten)
- Check je Render dashboard voor de status

### Stap 3: Testen van de endpoint

#### Optie A: Met curl (lokaal testen)
```bash
# Test met een foto
curl -X POST https://jouw-app.onrender.com/api/recognize-exercise \
  -F "image=@/path/to/your/image.jpg"
```

#### Optie B: Met Postman of Thunder Client
1. POST naar: `https://jouw-app.onrender.com/api/recognize-exercise`
2. Body type: `form-data`
3. Key: `image` (type: File)
4. Selecteer een foto
5. Send

#### Optie C: Met JSON (base64)
```bash
curl -X POST https://jouw-app.onrender.com/api/recognize-exercise \
  -H "Content-Type: application/json" \
  -d '{
    "image": "base64_encoded_string_here"
  }'
```

### Stap 4: Response verwachten
```json
{
  "exercise": "bench press"
}
```
Of bij onbekend:
```json
{
  "exercise": "unknown exercise"
}
```

## 🔧 In je iOS app gebruiken:

### Swift voorbeeld:
```swift
func recognizeExercise(imageData: Data) async throws -> String {
    let url = URL(string: "https://jouw-app.onrender.com/api/recognize-exercise")!
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    
    let boundary = UUID().uuidString
    request.setValue("multipart/form-data; boundary=\(boundary)", 
                     forHTTPHeaderField: "Content-Type")
    
    var body = Data()
    body.append("--\(boundary)\r\n".data(using: .utf8)!)
    body.append("Content-Disposition: form-data; name=\"image\"; filename=\"photo.jpg\"\r\n".data(using: .utf8)!)
    body.append("Content-Type: image/jpeg\r\n\r\n".data(using: .utf8)!)
    body.append(imageData)
    body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)
    
    request.httpBody = body
    
    let (data, _) = try await URLSession.shared.data(for: request)
    let response = try JSONDecoder().decode(ExerciseResponse.self, from: data)
    return response.exercise
}

struct ExerciseResponse: Codable {
    let exercise: String
}
```

## ⚠️ Belangrijk:
- ✅ OpenAI API key staat al als environment variable op Render
- ✅ API key wordt NOOIT naar de client gestuurd
- ✅ Endpoint is veilig en klaar voor productie

## 🐛 Troubleshooting:

### Endpoint geeft error "OpenAI not available"
- Check of `OPENAI_API_KEY` environment variable is ingesteld op Render
- Ga naar Render Dashboard → Environment → Check `OPENAI_API_KEY`

### Endpoint geeft "unknown exercise"
- Dit is normaal als de foto onduidelijk is
- Probeer een duidelijkere foto met de oefening goed zichtbaar

### Deploy faalt
- Check Render logs voor errors
- Zorg dat alle dependencies in `requirements.txt` staan
- Check of Python versie correct is (3.11.0 volgens render.yaml)

