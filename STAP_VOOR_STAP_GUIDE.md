# Stap-voor-stap: App naar App Store

## FASE 1: Capacitor Setup (Dag 1)

### Stap 1.1: Installeer Node.js (als je het nog niet hebt)
1. Ga naar: https://nodejs.org/
2. Download de LTS versie
3. Installeer het
4. Open Terminal en test: `node --version` (moet een versie tonen)

### Stap 1.2: Initialiseer npm in je project
```bash
cd /Users/robinflier/Documents/GV_AI
npm init -y
```

### Stap 1.3: Installeer Capacitor
```bash
npm install @capacitor/core @capacitor/cli
npm install @capacitor/ios @capacitor/android
```

### Stap 1.4: Initialiseer Capacitor
```bash
npx cap init
```
**Vragen die je krijgt:**
- App name: `GymVision AI`
- App ID: `com.gymvision.ai` (of je eigen domain)
- Web dir: `static` (of maak een `dist` folder als je een build proces hebt)

### Stap 1.5: Voeg platforms toe
```bash
npx cap add ios
npx cap add android
```

### Stap 1.6: Sync je web app
```bash
npx cap sync
```

---

## FASE 2: iOS Setup (Dag 2-3)

### Stap 2.1: Installeer Xcode
1. Open App Store op je Mac
2. Zoek "Xcode"
3. Installeer (kan lang duren, ~10GB)
4. Open Xcode en accepteer de licentie

### Stap 2.2: Open iOS project
```bash
npx cap open ios
```
Dit opent Xcode automatisch

### Stap 2.3: Configureer in Xcode
1. In Xcode, klik op "App" in de linker sidebar
2. Ga naar "Signing & Capabilities" tab
3. Vink "Automatically manage signing" aan
4. Selecteer je Apple ID (of maak er een aan)
5. Kies een Team (of maak er een aan - gratis voor development)

### Stap 2.4: Test op simulator
1. Bovenin Xcode, kies een iPhone simulator (bijv. iPhone 15)
2. Klik op de Play knop (▶️) of druk Cmd+R
3. App zou moeten openen in simulator

### Stap 2.5: Test op echt apparaat (optioneel)
1. Verbind je iPhone via USB
2. In Xcode, kies je iPhone als target
3. Klik Play
4. Op je iPhone: Settings > General > VPN & Device Management > Vertrouw je developer account

---

## FASE 3: Android Setup (Dag 3-4)

### Stap 3.1: Installeer Android Studio
1. Ga naar: https://developer.android.com/studio
2. Download Android Studio
3. Installeer (volg de wizard)
4. Open Android Studio

### Stap 3.2: Installeer Android SDK
1. In Android Studio: Tools > SDK Manager
2. Installeer:
   - Android 13 (API 33) of nieuwer
   - Android SDK Build-Tools
   - Android SDK Platform-Tools
3. Klik "Apply" en wacht tot installatie klaar is

### Stap 3.3: Open Android project
```bash
npx cap open android
```
Dit opent Android Studio

### Stap 3.4: Test op emulator
1. In Android Studio: Tools > Device Manager
2. Klik "Create Device"
3. Kies een telefoon (bijv. Pixel 6)
4. Kies een system image (bijv. Android 13)
5. Klik "Finish"
6. Klik de Play knop (▶️) in Android Studio
7. App zou moeten openen in emulator

---

## FASE 4: Native Features Toevoegen (Dag 4-5)

### Stap 4.1: Camera Plugin (voor AI detect)
```bash
npm install @capacitor/camera
npx cap sync
```

### Stap 4.2: Update je JavaScript code
In `static/app.js`, vervang file input met Capacitor Camera:

```javascript
import { Camera } from '@capacitor/camera';

// Vervang file input met:
async function takePicture() {
  const image = await Camera.getPhoto({
    quality: 90,
    allowEditing: false,
    resultType: 'base64'
  });
  
  // Gebruik image.base64String voor je ML model
}
```

### Stap 4.3: Voeg permissions toe

**iOS (Info.plist):**
Voeg toe in Xcode > App > Info:
- Privacy - Camera Usage Description: "We need camera access for AI exercise detection"

**Android (AndroidManifest.xml):**
Android Studio voegt dit automatisch toe, maar check:
```xml
<uses-permission android:name="android.permission.CAMERA" />
```

---

## FASE 5: App Store Assets Voorbereiden (Dag 5-7)

### Stap 5.1: Maak App Icon
1. Maak een 1024x1024px PNG
2. Geen transparantie
3. Geen ronde hoeken (Apple voegt die toe)
4. Gebruik je logo
5. Sla op als `icon-1024.png`

### Stap 5.2: Maak Screenshots
**iOS vereist:**
- iPhone 6.7" (1290 x 2796px) - iPhone 14 Pro Max, 15 Pro Max
- iPhone 6.5" (1242 x 2688px) - iPhone 11 Pro Max, 12 Pro Max
- iPhone 5.5" (1242 x 2208px) - iPhone 8 Plus

**Hoe te maken:**
1. Run app op simulator/device
2. Neem screenshots (Cmd+S in simulator)
3. Of gebruik een tool zoals: https://www.appstorescreenshot.com/

**Minimaal nodig:**
- 3 screenshots per formaat
- Toon verschillende features (Home, Workout Builder, Progress, etc.)

### Stap 5.3: Schrijf App Description
**App Name:** GymVision AI (max 30 karakters)

**Subtitle:** AI-Powered Workout Tracker (max 30 karakters)

**Description (max 4000 karakters):**
```
GymVision AI is your intelligent workout companion that uses advanced AI to recognize exercises from photos and helps you track your fitness journey.

KEY FEATURES:
• AI Exercise Detection - Simply take a photo and our AI identifies the exercise
• Workout Builder - Create and customize your workouts
• Progress Tracking - Monitor your strength gains with detailed charts
• Muscle Focus Analysis - See which muscle groups you're training
• Personal Records Timeline - Track your PRs over time
• Progressive Overload Tracker - Monitor your strength improvements

Perfect for gym enthusiasts who want to track their progress and optimize their training.
```

**Keywords (max 100 karakters):**
```
fitness,workout,gym,exercise,ai,training,strength,progress
```

### Stap 5.4: Maak Privacy Policy
**Verplicht voor App Store!**

Maak een pagina op je website of gebruik een generator:
- https://www.privacypolicygenerator.info/
- https://www.privacypolicies.com/

**Minimaal moet het bevatten:**
- Welke data je verzamelt
- Hoe je het gebruikt
- Met wie je het deelt
- Gebruikersrechten

Sla op als `privacy-policy.html` en host het online (bijv. op je website)

---

## FASE 6: Apple Developer Account (Dag 7-8)

### Stap 6.1: Registreer Apple Developer Account
1. Ga naar: https://developer.apple.com/programs/
2. Klik "Enroll"
3. Log in met je Apple ID
4. Betaal $99/jaar
5. Wacht op goedkeuring (kan 24-48 uur duren)

### Stap 6.2: Maak App ID
1. Ga naar: https://developer.apple.com/account
2. Certificates, Identifiers & Profiles
3. Identifiers > App IDs
4. Klik "+"
5. App ID: `com.gymvision.ai`
6. Capabilities: Push Notifications (als je die wilt)
7. Sla op

### Stap 6.3: Maak Provisioning Profile
1. In Xcode: App > Signing & Capabilities
2. Selecteer je Team
3. Xcode maakt automatisch een profile aan

---

## FASE 7: App Store Connect Setup (Dag 8-9)

### Stap 7.1: Maak App in App Store Connect
1. Ga naar: https://appstoreconnect.apple.com
2. Log in met je Apple Developer account
3. Klik "My Apps" > "+" > "New App"
4. Vul in:
   - Platform: iOS
   - Name: GymVision AI
   - Primary Language: English (of Dutch)
   - Bundle ID: com.gymvision.ai
   - SKU: GYMVISION001 (unieke code)
5. Klik "Create"

### Stap 7.2: Vul App Information in
1. App Information:
   - Category: Health & Fitness
   - Subcategory: (optioneel)
   - Privacy Policy URL: (link naar je privacy policy)

2. Pricing and Availability:
   - Price: Free (of kies een prijs)
   - Availability: All countries (of specifieke landen)

3. App Privacy:
   - Beantwoord vragen over data verzameling
   - Camera: Yes (voor AI detection)
   - User Content: Yes (workouts, progress)

### Stap 7.3: Upload App Icon en Screenshots
1. App Store > App Information
2. Upload je 1024x1024 icon
3. Upload screenshots voor elke vereiste iPhone size
4. Upload App Preview video (optioneel maar aanbevolen)

### Stap 7.4: Vul Description in
1. Name: GymVision AI
2. Subtitle: AI-Powered Workout Tracker
3. Description: (je geschreven description)
4. Keywords: (je keywords)
5. Support URL: (bijv. https://gymvision.ai/support)
6. Marketing URL: (optioneel)

---

## FASE 8: Build en Upload (Dag 9-10)

### Stap 8.1: Update Version in Xcode
1. Open Xcode
2. Selecteer "App" in sidebar
3. General tab
4. Version: 1.0.0
5. Build: 1

### Stap 8.2: Archive je App
1. In Xcode: Product > Archive
2. Wacht tot build klaar is
3. Window > Organizer opent automatisch

### Stap 8.3: Upload naar App Store
1. In Organizer, selecteer je archive
2. Klik "Distribute App"
3. Kies "App Store Connect"
4. Kies "Upload"
5. Volg de wizard
6. Wacht tot upload klaar is (kan 10-30 min duren)

### Stap 8.4: Submit voor Review
1. Ga terug naar App Store Connect
2. Je app > Versions
3. Klik "+" naast "Build"
4. Selecteer je geüploade build
5. Vul "What's New" in (voor versie 1.0: "Initial release")
6. Klik "Submit for Review"
7. Beantwoord export compliance vragen
8. Submit!

---

## FASE 9: Google Play Store (Dag 11-15)

### Stap 9.1: Registreer Google Play Developer Account
1. Ga naar: https://play.google.com/console
2. Betaal $25 eenmalig
3. Wacht op goedkeuring (meestal binnen 24 uur)

### Stap 9.2: Maak App in Play Console
1. Create app
2. App name: GymVision AI
3. Default language: English
4. App type: App
5. Free or Paid: Free
6. Declare: Content rating, Privacy policy, etc.

### Stap 9.3: Upload App Bundle
```bash
# In Android Studio
Build > Generate Signed Bundle / APK
Kies "Android App Bundle"
Volg wizard om keystore te maken
Upload het .aab bestand naar Play Console
```

### Stap 9.4: Vul Store Listing in
1. App icon: 512x512px
2. Feature graphic: 1024x500px
3. Screenshots: Minimaal 2, maximaal 8
4. Description: Max 4000 karakters
5. Short description: Max 80 karakters

### Stap 9.5: Submit voor Review
1. Content rating: Vul vragenlijst in
2. Target audience: 13+ (of ouder)
3. Data safety: Beantwoord vragen
4. Submit for review

---

## FASE 10: Wachten op Goedkeuring

### iOS App Store
- Review tijd: 1-2 weken (meestal 3-7 dagen)
- Je krijgt email bij goedkeuring/afwijzing
- Bij afwijzing: Los issues op en resubmit

### Google Play Store
- Review tijd: 1-3 dagen (meestal binnen 24 uur)
- Sneller dan Apple

---

## Checklist: Wat je nodig hebt

### Technisch
- [ ] Node.js geïnstalleerd
- [ ] Capacitor geïnstalleerd en geconfigureerd
- [ ] Xcode geïnstalleerd (voor iOS)
- [ ] Android Studio geïnstalleerd (voor Android)
- [ ] App werkt op simulator/emulator
- [ ] App werkt op echt device
- [ ] Camera permissions werken
- [ ] Backend is online (niet localhost!)

### Assets
- [ ] App icon 1024x1024px
- [ ] iOS screenshots (3+ per formaat)
- [ ] Android screenshots (2+)
- [ ] App description geschreven
- [ ] Keywords bedacht
- [ ] Privacy policy gemaakt en online gehost

### Accounts
- [ ] Apple Developer Account ($99/jaar)
- [ ] Google Play Developer Account ($25)
- [ ] App Store Connect app aangemaakt
- [ ] Play Console app aangemaakt

### Backend
- [ ] Backend deployed naar cloud (Heroku, AWS, etc.)
- [ ] API endpoints werken
- [ ] CORS correct geconfigureerd
- [ ] Database online (niet lokaal)

---

## Veelvoorkomende Problemen

### "Code signing failed"
- Check of je Apple Developer account actief is
- Check of je Team geselecteerd is in Xcode
- Check of Bundle ID overeenkomt met App Store Connect

### "App crashes on device"
- Check console logs in Xcode
- Test eerst op simulator
- Check of alle permissions zijn toegevoegd

### "Backend not reachable"
- Zorg dat backend online is (niet localhost)
- Update API URLs in je app
- Check CORS settings

### "ML model too slow"
- Overweeg model optimalisatie
- Of gebruik server-side inference (vereist internet)

---

## Hulp Nodig?

Als je vastloopt:
1. Check Capacitor docs: https://capacitorjs.com/docs
2. Check Apple docs: https://developer.apple.com/documentation
3. Stack Overflow voor specifieke errors

**Begin met Fase 1 en werk stap voor stap door!**

