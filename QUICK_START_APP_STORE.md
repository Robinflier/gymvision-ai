# 🚀 Quick Start: App Store Submission

## ⚡ Snelle Stappen (30 minuten)

### 1. Apple Developer Account (als je die nog niet hebt)
- Ga naar: https://developer.apple.com/programs/
- Betaal $99/jaar
- Wacht op activatie (kan 24-48 uur duren)

### 2. App Store Connect Setup (10 min)
1. Log in op https://appstoreconnect.apple.com
2. Klik op **"My Apps"** > **"+"** > **"New App"**
3. Vul in:
   - **Name**: GymVision AI
   - **Primary Language**: English
   - **Bundle ID**: `com.gymvision.ai`
   - **SKU**: `gymvision-ai-001` (of iets unieks)

### 3. Privacy Policy (VERPLICHT - 15 min)
Je **moet** een privacy policy hebben. Opties:

**Optie A: Gebruik een generator**
- https://www.privacypolicygenerator.info/
- https://www.freeprivacypolicy.com/

**Optie B: Host op je website**
- Upload naar je backend (bijv. `/privacy` route)
- Of gebruik GitHub Pages

**Optie C: Gebruik een service**
- https://www.termsfeed.com/
- https://www.iubenda.com/

**Minimaal moet je vermelden:**
- Welke data je verzamelt (email, workout data, foto's)
- Hoe je data gebruikt
- Of je data deelt met derden (Supabase)
- Gebruikersrechten (data verwijderen, etc.)

### 4. Xcode Configuratie (5 min)
```bash
# Open project
cd /Users/robinflier/Documents/GV_AI
open ios/App/App.xcworkspace
```

In Xcode:
1. Selecteer **App** project > **App** target
2. **Signing & Capabilities** tab:
   - Vink **"Automatically manage signing"** aan
   - Selecteer je **Team**
3. **General** tab:
   - **Version**: `1.0.0`
   - **Build**: `1`
   - **iOS Deployment Target**: `13.0` of hoger

### 5. Camera Permissions Toevoegen (als nog niet gedaan)
Voeg toe aan `ios/App/App/Info.plist` (voor de `</dict>` tag):

```xml
<key>NSCameraUsageDescription</key>
<string>We need camera access to detect exercises from photos</string>
<key>NSPhotoLibraryUsageDescription</key>
<string>We need photo library access to select exercise images</string>
```

### 6. App Icon (5 min)
1. Maak een 1024x1024 PNG icon (geen transparantie)
2. In Xcode: **Assets.xcassets** > **AppIcon**
3. Sleep je icon naar het 1024x1024 vak

### 7. Build & Archive (10 min)
1. Selecteer **"Any iOS Device"** (niet simulator)
2. **Product** > **Archive**
3. Wacht tot build klaar is
4. In Organizer: **Validate App**
5. Daarna: **Distribute App** > **App Store Connect** > **Upload**

### 8. App Store Connect Invullen (30-60 min)
1. **App Information**:
   - Description (min 4000 karakters)
   - Keywords (max 100 karakters)
   - Support URL: https://jouwwebsite.com/support
   - Privacy Policy URL: **VERPLICHT**

2. **Screenshots**:
   - Maak screenshots van je app
   - Upload voor iPhone 6.7" (1290 x 2796)
   - Minimaal 3 screenshots

3. **App Review**:
   - Demo account (als je login hebt)
   - Notes voor reviewers

4. **Submit for Review**

---

## ✅ Pre-Flight Checklist

Voordat je submit:

- [ ] Apple Developer account actief ($99 betaald)
- [ ] Privacy policy URL werkt en is toegankelijk
- [ ] Support URL werkt
- [ ] App icon 1024x1024 geüpload
- [ ] Screenshots geüpload (minimaal 3)
- [ ] App description compleet
- [ ] Keywords ingevuld
- [ ] Demo account werkt (als nodig)
- [ ] App getest op echt apparaat
- [ ] Geen crashes of bugs
- [ ] Version en Build number correct

---

## 🎯 Meest Belangrijke Stappen

1. **Privacy Policy** - Zonder dit wordt je app afgewezen
2. **App Icon** - 1024x1024, geen transparantie
3. **Screenshots** - Minimaal 3, juiste afmetingen
4. **Demo Account** - Als je login hebt, zorg dat reviewers kunnen testen

---

## ⚠️ Veelgemaakte Fouten

1. **Geen privacy policy** → App wordt afgewezen
2. **Privacy policy URL werkt niet** → App wordt afgewezen
3. **Demo account werkt niet** → Reviewers kunnen niet testen
4. **Screenshots verkeerde afmetingen** → Moet opnieuw uploaden
5. **App icon heeft transparantie** → Wordt afgewezen

---

## 📞 Hulp Nodig?

- **Apple Developer Support**: https://developer.apple.com/support/
- **Review Guidelines**: https://developer.apple.com/app-store/review/guidelines/

**Succes! 🚀**





