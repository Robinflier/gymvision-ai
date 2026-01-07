# 📱 App Store Connect Content - Stap voor Stap

## ✅ Wat je al hebt:
- Privacy Policy route: `/privacy` (werkt als je backend deployed is)
- Support route: `/support` (werkt als je backend deployed is)

## 🎯 Wat je nog moet doen:

### 1. App Icon (1024x1024 PNG)

**Optie A: Gebruik bestaand logo**
1. Open je `static/logo.png` in een image editor
2. Resize naar 1024x1024 pixels
3. Zorg dat er geen transparantie is (voeg witte achtergrond toe als nodig)
4. Export als PNG

**Optie B: Maak nieuw icon**
- Gebruik een tool zoals:
  - **Figma** (gratis): https://www.figma.com
  - **Canva** (gratis): https://www.canva.com
  - **GIMP** (gratis): https://www.gimp.org
- Maak een 1024x1024 PNG
- Geen transparantie!

**Uploaden in Xcode:**
1. Open `ios/App/App.xcworkspace` in Xcode
2. Ga naar **Assets.xcassets** > **AppIcon**
3. Sleep je 1024x1024 PNG naar het grote vak
4. Xcode genereert automatisch alle formaten

---

### 2. Screenshots Maken

**Stap 1: Test op echt apparaat**
1. Build en run je app op een echt iPhone (niet simulator)
2. Test alle belangrijke features:
   - Workout builder
   - AI workout generatie (Vision chat)
   - Progress tracking
   - Settings

**Stap 2: Screenshots maken**
- Op iPhone: Druk **Power + Volume Up** tegelijk
- Screenshots worden opgeslagen in Foto's app

**Stap 3: Screenshots bewerken (optioneel)**
- Je kunt screenshots bewerken in de Foto's app
- Of gebruik een tool zoals:
  - **Preview** (Mac) - resize naar juiste afmetingen
  - **Photoshop** / **GIMP**
  - Online: https://www.iloveimg.com/resize-image

**Vereiste afmetingen:**
- **iPhone 6.7"** (iPhone 14 Pro Max, 15 Pro Max): **1290 x 2796 pixels**
- **iPhone 6.5"** (iPhone 11 Pro Max, XS Max): **1242 x 2688 pixels**  
- **iPhone 5.5"** (iPhone 8 Plus): **1242 x 2208 pixels**

**Minimaal 3 screenshots per formaat**

**Aanbevolen screenshots:**
1. **Home/Vision chat** - Laat de AI workout feature zien
2. **Workout builder** - Toon een workout met oefeningen
3. **Progress tab** - Laat progress tracking zien
4. **Exercise detection** - Toon camera feature (optioneel)

---

### 3. App Description Schrijven

**Vereisten:**
- Minimaal 4000 karakters
- Maximaal 4000 karakters
- Beschrijf wat je app doet
- Highlight key features

**Voorbeeld structuur:**

```
GymVision AI - Your Personal AI Workout Builder

Transform your fitness journey with GymVision AI, the intelligent workout companion that creates personalized training plans instantly.

🎯 KEY FEATURES:

✨ AI-Powered Workout Generation
Tell our AI assistant "Vision" what you want to train, and get a complete workout plan in seconds. Whether you want a push workout, leg day, or full body training - just ask and receive.

📸 Smart Exercise Detection
Take a photo of gym equipment and our advanced AI instantly recognizes what exercise you're doing. No more guessing or searching through exercise lists.

💪 Comprehensive Exercise Library
Access hundreds of exercises with detailed instructions, muscle targeting information, and video demonstrations. Build your perfect workout from scratch or let AI do it for you.

📊 Progress Tracking
Track your weights, sets, and reps over time. Visualize your progress with detailed charts and see your strength improvements week by week.

🏋️ Workout Builder
Create custom workouts with our intuitive builder. Add exercises, set reps and sets, and save your favorite routines for quick access.

📈 Personal Records
Never forget your PRs again. Track your personal bests for each exercise and celebrate your achievements.

🔒 Privacy First
Your data is yours. All workout data is stored securely and privately. We use industry-standard encryption to protect your information.

🎨 Beautiful, Modern Design
Enjoy a sleek, dark-themed interface designed for focus and motivation. Every detail is crafted for the best user experience.

Whether you're a beginner starting your fitness journey or an experienced athlete looking to optimize your training, GymVision AI adapts to your needs and helps you achieve your goals.

Download GymVision AI today and experience the future of fitness training.
```

**Tips:**
- Gebruik emoji's spaarzaam (max 1-2 per paragraaf)
- Highlight unieke features (AI workout generation)
- Noem voordelen, niet alleen features
- Maak het persoonlijk en motiverend

---

### 4. Keywords

**Vereisten:**
- Maximaal 100 karakters totaal
- Komma-gescheiden
- Geen herhalingen
- Geen merknamen (behalve je eigen)

**Voorbeeld keywords:**
```
fitness,workout,gym,exercise,ai,training,muscle,strength,bodybuilding,health,wellness,personal trainer
```

**Tips:**
- Gebruik populaire zoektermen
- Denk aan wat gebruikers zouden zoeken
- Test keywords op App Store (zoek op je keywords)
- Vermijd generieke woorden als "app" of "mobile"

**Goede keywords voor jouw app:**
- fitness, workout, gym, exercise, training
- ai, artificial intelligence, smart workout
- muscle, strength, bodybuilding
- health, wellness, fitness tracker
- personal trainer, workout builder

---

### 5. Support URL Controleren

**Je hebt al een support route: `/support`**

**Voor App Store Connect:**
- Als je backend deployed is op: `https://gymvision-ai.onrender.com`
- Dan is je Support URL: `https://gymvision-ai.onrender.com/support`

**Test:**
1. Deploy je backend (als nog niet gedaan)
2. Ga naar: `https://jouw-backend-url.com/support`
3. Controleer dat de pagina werkt
4. Gebruik deze URL in App Store Connect

---

### 6. Privacy Policy URL Controleren

**Je hebt al een privacy route: `/privacy`**

**Voor App Store Connect:**
- Als je backend deployed is op: `https://gymvision-ai.onrender.com`
- Dan is je Privacy Policy URL: `https://gymvision-ai.onrender.com/privacy`

**Test:**
1. Deploy je backend (als nog niet gedaan)
2. Ga naar: `https://jouw-backend-url.com/privacy`
3. Controleer dat de pagina werkt en compleet is
4. Gebruik deze URL in App Store Connect

**Belangrijk:**
- Privacy Policy moet publiek toegankelijk zijn
- Moet werken zonder login
- Moet alle vereiste informatie bevatten

---

## 📋 Checklist voor App Store Connect

Voordat je submit, controleer:

### Content:
- [ ] App description geschreven (4000 karakters)
- [ ] Keywords ingevuld (max 100 karakters)
- [ ] App icon 1024x1024 geüpload in Xcode
- [ ] Screenshots gemaakt (minimaal 3 per formaat)
- [ ] Screenshots geüpload in App Store Connect

### URLs:
- [ ] Support URL werkt: `https://jouw-backend-url.com/support`
- [ ] Privacy Policy URL werkt: `https://jouw-backend-url.com/privacy`
- [ ] Beide URLs zijn publiek toegankelijk (geen login nodig)

### Metadata:
- [ ] App Name: "GymVision AI"
- [ ] Subtitle (optioneel): "AI Workout Builder"
- [ ] Category: Health & Fitness
- [ ] Secondary Category (optioneel): Sports
- [ ] Age Rating ingevuld

### Demo Account (als je login hebt):
- [ ] Demo account aangemaakt
- [ ] Username en password opgegeven
- [ ] Instructies voor reviewers toegevoegd

---

## 🚀 Volgende Stappen

1. **Maak app icon** → Upload in Xcode
2. **Maak screenshots** → Test op echt apparaat, maak screenshots
3. **Schrijf description** → Gebruik bovenstaand voorbeeld als startpunt
4. **Bepaal keywords** → Gebruik bovenstaande suggesties
5. **Deploy backend** → Zorg dat Support en Privacy URLs werken
6. **Upload alles in App Store Connect** → Vul alle velden in
7. **Submit voor review** → Klaar!

---

## 💡 Tips

- **Screenshots**: Maak ze op een echt apparaat, niet simulator (beter kwaliteit)
- **Description**: Schrijf vanuit gebruiker perspectief (wat krijg ik?)
- **Keywords**: Test ze eerst door te zoeken op App Store
- **Privacy Policy**: Zorg dat het compleet is, Apple is streng hierop
- **Support URL**: Zorg dat het professioneel oogt

**Succes! 🎉**





