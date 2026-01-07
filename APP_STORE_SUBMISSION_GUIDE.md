# App Store Submission Guide - GymVision AI

## 📋 Voorbereiding Checklist

### 1. Apple Developer Account
- [ ] **Apple Developer Program lidmaatschap** ($99/jaar)
  - Ga naar: https://developer.apple.com/programs/
  - Registreer of log in met je Apple ID
  - Betaal het jaarlijkse lidmaatschap

### 2. App Store Connect Setup
- [ ] Log in op [App Store Connect](https://appstoreconnect.apple.com)
- [ ] Maak een nieuwe app aan:
  - **App Name**: GymVision AI
  - **Primary Language**: English (of Dutch)
  - **Bundle ID**: `com.gymvision.ai` (moet overeenkomen met capacitor.config.json)
  - **SKU**: Unieke identifier (bijv. `gymvision-ai-001`)

### 3. App Metadata Voorbereiden

#### Vereiste Informatie:
- [ ] **App Description** (max 4000 karakters)
- [ ] **Keywords** (max 100 karakters, komma-gescheiden)
- [ ] **Support URL**: Je website URL
- [ ] **Privacy Policy URL**: **VERPLICHT** - Je moet een privacy policy hebben
- [ ] **Marketing URL** (optioneel)
- [ ] **App Icon**: 1024x1024 pixels (PNG, geen transparantie)
- [ ] **Screenshots**: 
  - iPhone 6.7" (iPhone 14 Pro Max): 1290 x 2796 pixels
  - iPhone 6.5" (iPhone 11 Pro Max): 1242 x 2688 pixels
  - iPhone 5.5" (iPhone 8 Plus): 1242 x 2208 pixels
  - Minimaal 3 screenshots per apparaat type

#### App Categorieën:
- [ ] **Primary Category**: Health & Fitness
- [ ] **Secondary Category** (optioneel): Sports

#### Age Rating:
- [ ] Vul de vragenlijst in (waarschijnlijk 4+ of 12+)

---

## 🔧 Xcode Configuratie

### Stap 1: Open het Project
```bash
cd /Users/robinflier/Documents/GV_AI
open ios/App/App.xcworkspace
```

### Stap 2: Bundle Identifier Controleren
1. Selecteer het **App** project in de linker sidebar
2. Selecteer het **App** target
3. Ga naar **Signing & Capabilities** tab
4. Controleer dat **Bundle Identifier** = `com.gymvision.ai`
5. Vink **Automatically manage signing** aan
6. Selecteer je **Team** (je Apple Developer account)

### Stap 3: Version & Build Number
1. In dezelfde **Signing & Capabilities** tab:
   - **Version**: `1.0.0` (of je huidige versie)
   - **Build**: `1` (verhoog dit bij elke build)

### Stap 4: Deployment Target
1. Ga naar **General** tab
2. **iOS Deployment Target**: Minimaal iOS 13.0 (of hoger als je moderne features gebruikt)

### Stap 5: App Icon
1. Ga naar **Assets.xcassets** > **AppIcon**
2. Upload een 1024x1024 PNG icon (geen transparantie)
3. Alle formaten worden automatisch gegenereerd

### Stap 6: Capabilities Controleren
Controleer of je de juiste capabilities hebt:
- [ ] **Camera** (als je camera gebruikt)
- [ ] **Photo Library** (als je foto's opslaat)
- [ ] **Internet** (voor API calls)

---

## 📱 Build voor App Store

### Stap 1: Archive Build Maken

1. **Selecteer "Any iOS Device"** in de device selector (bovenaan Xcode)
2. Ga naar **Product** > **Archive**
3. Wacht tot de build klaar is
4. Het **Organizer** venster opent automatisch

### Stap 2: Archive Valideren
1. In de Organizer, selecteer je archive
2. Klik op **Validate App**
3. Selecteer je **Distribution Certificate** en **Provisioning Profile**
4. Los eventuele waarschuwingen op
5. Klik **Next** en wacht op validatie

### Stap 3: Upload naar App Store Connect
1. In de Organizer, selecteer je archive
2. Klik op **Distribute App**
3. Selecteer **App Store Connect**
4. Kies **Upload**
5. Volg de wizard:
   - Selecteer je team
   - Kies **Automatically manage signing**
   - Klik **Upload**

**Alternatief: Command Line Upload**
```bash
# Na het archiven, upload via command line:
xcrun altool --upload-app \
  --type ios \
  --file "path/to/your/app.ipa" \
  --username "your-apple-id@email.com" \
  --password "app-specific-password"
```

---

## 📝 App Store Connect Configuratie

### Stap 1: App Informatie Invullen

1. **App Information**:
   - Name: GymVision AI
   - Subtitle (optioneel): Your AI-powered workout companion
   - Category: Health & Fitness
   - Content Rights: Je hebt de rechten

2. **Pricing and Availability**:
   - Price: Gratis of betaald
   - Availability: Alle landen of specifieke landen

### Stap 2: Versie Informatie

1. **Version**: 1.0.0
2. **What's New in This Version**: Beschrijving van nieuwe features
3. **Description**: Volledige app beschrijving
4. **Keywords**: Zoekwoorden (bijv. "fitness, workout, gym, ai, exercise")
5. **Support URL**: https://jouwwebsite.com/support
6. **Marketing URL** (optioneel)
7. **Privacy Policy URL**: **VERPLICHT** - https://jouwwebsite.com/privacy

### Stap 3: Screenshots Uploaden

1. Upload screenshots voor elk vereist apparaat type
2. Minimaal 3 screenshots per apparaat
3. Gebruik de juiste afmetingen (zie hierboven)

### Stap 4: App Review Informatie

1. **Contact Information**:
   - First Name, Last Name
   - Phone Number
   - Email Address

2. **Demo Account** (als je login hebt):
   - Username
   - Password
   - Instructies voor reviewers

3. **Notes** (optioneel):
   - Extra informatie voor reviewers
   - Bijv. "Test account: test@example.com / password123"

### Stap 5: Export Compliance

- [ ] **Does your app use encryption?**
  - Meestal: "No" (tenzij je specifieke encryptie gebruikt)
  - Als je HTTPS gebruikt: "Yes, but exempt" (HTTPS is standaard)

### Stap 6: Content Rights

- [ ] Bevestig dat je alle rechten hebt op de content
- [ ] Bevestig dat je geen copyright schendt

---

## 🚀 Submission Proces

### Stap 1: Build Selecteren
1. Ga naar **TestFlight** tab (optioneel, voor beta testing)
2. Of ga direct naar **App Store** tab
3. Klik op **+ Version or Platform**
4. Selecteer je geüploade build

### Stap 2: Review Voorbereiden
1. Controleer alle informatie:
   - [ ] App informatie compleet
   - [ ] Screenshots geüpload
   - [ ] Privacy policy URL werkt
   - [ ] Support URL werkt
   - [ ] Demo account werkt (als nodig)

### Stap 3: Submit voor Review
1. Klik op **Submit for Review**
2. Beantwoord de export compliance vragen
3. Bevestig de submission

### Stap 4: Review Status
- **Waiting for Review**: Je app staat in de wachtrij
- **In Review**: Apple beoordeelt je app (1-3 dagen)
- **Pending Developer Release**: Goedgekeurd, wacht op release
- **Ready for Sale**: Live in de App Store! 🎉

---

## ⚠️ Veelvoorkomende Problemen

### 1. Code Signing Errors
**Probleem**: "No signing certificate found"
**Oplossing**: 
- Ga naar Xcode > Preferences > Accounts
- Voeg je Apple ID toe
- Download certificaten automatisch

### 2. Provisioning Profile Issues
**Probleem**: "No provisioning profile found"
**Oplossing**:
- Vink "Automatically manage signing" aan in Xcode
- Xcode maakt automatisch profiles aan

### 3. Missing Privacy Policy
**Probleem**: App wordt afgewezen omdat privacy policy ontbreekt
**Oplossing**:
- Maak een privacy policy pagina op je website
- Voeg de URL toe in App Store Connect

### 4. App Rejected - Missing Information
**Probleem**: Reviewers kunnen de app niet testen
**Oplossing**:
- Zorg voor een werkende demo account
- Voeg duidelijke instructies toe in "Notes"

### 5. Screenshot Requirements
**Probleem**: Screenshots worden afgewezen
**Oplossing**:
- Gebruik exacte afmetingen
- Geen tekst overlays (tenzij deel van de UI)
- Geen frame mockups nodig

---

## 📋 Pre-Submission Checklist

### Technisch
- [ ] App werkt zonder crashes
- [ ] Alle features getest
- [ ] Privacy policy URL werkt
- [ ] Support URL werkt
- [ ] App icon 1024x1024 geüpload
- [ ] Screenshots voor alle vereiste formaten
- [ ] Version en Build number correct

### Content
- [ ] App description compleet en foutloos
- [ ] Keywords ingevuld
- [ ] Demo account werkt (als nodig)
- [ ] Review notes toegevoegd (als nodig)

### Legal
- [ ] Privacy policy beschikbaar
- [ ] Terms of service (als van toepassing)
- [ ] Export compliance beantwoord
- [ ] Content rights bevestigd

### Metadata
- [ ] App name correct
- [ ] Subtitle (optioneel)
- [ ] Categorieën geselecteerd
- [ ] Age rating ingevuld
- [ ] Pricing ingesteld

---

## 🎯 Snelle Commands

```bash
# Sync Capacitor
npx cap sync ios

# Open in Xcode
npx cap open ios

# Build voor release (in Xcode)
# Product > Archive

# Check build number
# In Xcode: General tab > Build
```

---

## 📞 Hulp

- **Apple Developer Support**: https://developer.apple.com/support/
- **App Store Review Guidelines**: https://developer.apple.com/app-store/review/guidelines/
- **Human Interface Guidelines**: https://developer.apple.com/design/human-interface-guidelines/

---

## ⏱️ Tijdlijn

- **Voorbereiding**: 1-2 dagen
- **Build & Upload**: 1-2 uur
- **App Store Connect Setup**: 2-4 uur
- **Review Wachtrij**: 1-7 dagen
- **Review Proces**: 1-3 dagen
- **Totaal**: ~1-2 weken

**Succes met je submission! 🚀**





