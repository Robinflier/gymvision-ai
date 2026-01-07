# 📱 Google Play Store Submission Guide - GymVision AI

## 📋 Wat Je Nodig Hebt

### 1. Google Play Developer Account
- [ ] **Google Play Console Account** ($25 eenmalig)
  - Ga naar: https://play.google.com/console/signup
  - Betaal eenmalig $25 registratiekosten
  - Account wordt direct geactiveerd (geen wachttijd zoals bij Apple)

### 2. App Signing Key (VERPLICHT)
- [ ] **Keystore bestand** - Dit is je digitale handtekening
  - **BELANGRIJK**: Bewaar dit bestand veilig! Zonder dit kun je updates niet meer uitbrengen
  - Maak een keystore aan (zie hieronder)

### 3. App Assets
- [ ] **App Icon**: 512x512 pixels (PNG, geen transparantie)
- [ ] **Feature Graphic**: 1024x500 pixels (voor Play Store listing)
- [ ] **Screenshots**: 
  - Phone: Minimaal 2, maximaal 8 (16:9 of 9:16 ratio)
  - Tablet (optioneel): Minimaal 2, maximaal 8
  - Aanbevolen: 1080x1920 pixels voor phones
- [ ] **Privacy Policy URL**: **VERPLICHT** - Moet publiek toegankelijk zijn

---

## 🔑 Stap 1: Keystore Aanmaken (VERPLICHT)

Dit is je digitale handtekening. **BEWAAR DIT BESTAND VEILIG!**

```bash
cd /Users/robinflier/Documents/GV_AI/android/app

# Maak een keystore aan
keytool -genkey -v -keystore gymvision-release-key.jks \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias gymvision-key

# Je wordt gevraagd om:
# - Wachtwoord (BEWAAR DIT!)
# - Naam, organisatie, etc.
```

**BELANGRIJK:**
- Bewaar `gymvision-release-key.jks` op een veilige plek
- Bewaar het wachtwoord veilig
- Zonder deze files kun je **NOOIT MEER** updates uitbrengen!

**Maak een backup:**
- Upload naar cloud storage (versleuteld)
- Bewaar op externe harde schijf
- Print de details uit en bewaar fysiek

---

## 🔧 Stap 2: Android Build Configureren

### 2.1 Keystore Configuratie

Maak een bestand `android/key.properties`:

```properties
storePassword=JE_WACHTWOORD_HIER
keyPassword=JE_WACHTWOORD_HIER
keyAlias=gymvision-key
storeFile=app/gymvision-release-key.jks
```

**BELANGRIJK:** Voeg `key.properties` toe aan `.gitignore` (NIET committen!)

### 2.2 Build.gradle Aanpassen

Update `android/app/build.gradle`:

```gradle
apply plugin: 'com.android.application'

// Laad keystore properties
def keystorePropertiesFile = rootProject.file("key.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}

android {
    namespace "com.gymvision.ai"
    compileSdk rootProject.ext.compileSdkVersion
    
    defaultConfig {
        applicationId "com.gymvision.ai"
        minSdkVersion rootProject.ext.minSdkVersion
        targetSdkVersion rootProject.ext.targetSdkVersion
        versionCode 1  // Verhoog dit bij elke release
        versionName "1.0.0"  // Versie nummer voor gebruikers
        testInstrumentationRunner "androidx.test.runner.AndroidJUnitRunner"
    }
    
    signingConfigs {
        release {
            if (keystorePropertiesFile.exists()) {
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
                storeFile file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
            }
        }
    }
    
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
        }
    }
}

// ... rest van de file blijft hetzelfde
```

### 2.3 Version Code & Version Name

**Version Code** (`versionCode`):
- Moet een integer zijn (1, 2, 3, ...)
- Verhoog bij elke release
- Play Store gebruikt dit om te bepalen welke versie nieuwer is

**Version Name** (`versionName`):
- String die gebruikers zien (bijv. "1.0.0", "1.2.3")
- Kan alles zijn, maar gebruik semver (major.minor.patch)

---

## 📦 Stap 3: Release Build Maken

### 3.1 Sync Capacitor

```bash
cd /Users/robinflier/Documents/GV_AI

# Sync web assets naar Android
npx cap sync android
```

### 3.2 Build Release APK/AAB

**Optie A: Android App Bundle (AAB) - AANBEVOLEN**
```bash
cd android
./gradlew bundleRelease

# Output: android/app/build/outputs/bundle/release/app-release.aab
```

**Optie B: APK (ouder, maar werkt ook)**
```bash
cd android
./gradlew assembleRelease

# Output: android/app/build/outputs/apk/release/app-release.apk
```

**Google raadt AAB aan** omdat:
- Kleinere download sizes
- Dynamic delivery
- Betere optimalisatie

### 3.3 Test de Release Build

```bash
# Installeer op je device om te testen
adb install android/app/build/outputs/apk/release/app-release.apk
```

**Test checklist:**
- [ ] App start zonder crashes
- [ ] Alle features werken
- [ ] Login werkt
- [ ] Camera werkt
- [ ] Workouts kunnen worden opgeslagen
- [ ] Geen console errors

---

## 🎨 Stap 4: Play Store Assets Voorbereiden

### 4.1 App Icon
- **Formaat**: 512x512 pixels
- **Type**: PNG
- **Geen transparantie**
- **Ronde hoeken**: Google voegt deze automatisch toe

### 4.2 Feature Graphic
- **Formaat**: 1024x500 pixels
- **Type**: PNG of JPG
- **Gebruik**: Banner bovenaan je Play Store listing
- **Tip**: Maak iets aantrekkelijks met je app naam/logo

### 4.3 Screenshots
- **Phone screenshots**: 
  - Minimaal 2, maximaal 8
  - Ratio: 16:9 of 9:16
  - Aanbevolen: 1080x1920 pixels (portrait)
  - Of: 1920x1080 pixels (landscape)
  
- **Tablet screenshots** (optioneel):
  - Minimaal 2, maximaal 8
  - Ratio: 16:9 of 9:16

**Tips voor screenshots:**
- Toon de belangrijkste features
- Gebruik echte app screenshots (geen mockups)
- Voeg tekst toe met features (optioneel)
- Maak ze aantrekkelijk en professioneel

### 4.4 Privacy Policy
**VERPLICHT!** Zonder dit wordt je app afgewezen.

**Opties:**
1. Host op je website: `https://jouwwebsite.com/privacy`
2. Gebruik een generator:
   - https://www.privacypolicygenerator.info/
   - https://www.freeprivacypolicy.com/
3. GitHub Pages (gratis)

**Minimaal moet je vermelden:**
- Welke data je verzamelt (email, workout data, foto's)
- Hoe je data gebruikt
- Of je data deelt met derden (Supabase, OpenAI, etc.)
- Gebruikersrechten (data verwijderen, etc.)
- Contact informatie

---

## 🚀 Stap 5: Google Play Console Setup

### 5.1 App Aanmaken

1. Log in op https://play.google.com/console
2. Klik op **"Create app"**
3. Vul in:
   - **App name**: GymVision AI
   - **Default language**: English (of Dutch)
   - **App or game**: App
   - **Free or paid**: Free (of Paid)
   - **Declarations**: Accepteer de voorwaarden

### 5.2 App Details Invullen

**Store listing:**
- **Short description** (max 80 karakters):
  - Bijv: "AI-powered workout tracker with exercise recognition"
  
- **Full description** (max 4000 karakters):
  - Beschrijf alle features
  - Gebruik bullet points
  - Noem belangrijke features
  
- **App icon**: Upload 512x512 PNG
- **Feature graphic**: Upload 1024x500 PNG
- **Screenshots**: Upload minimaal 2 phone screenshots
- **Privacy Policy URL**: **VERPLICHT** - Voeg je URL toe

**Categorization:**
- **App category**: Health & Fitness
- **Tags** (optioneel): fitness, workout, gym, ai, exercise

**Contact details:**
- **Email**: Je contact email
- **Phone** (optioneel)
- **Website**: Je website URL

### 5.3 Content Rating

1. Klik op **"Content rating"**
2. Vul de vragenlijst in
3. Voor een fitness app: waarschijnlijk **"Everyone"**
4. Wacht op certificering (kan enkele uren duren)

### 5.4 Target Audience

- **Target age group**: Selecteer geschikte leeftijdsgroep
- **Primary audience**: General
- **Content designed for children**: Meestal "No"

---

## 📤 Stap 6: App Uploaden

### 6.1 Production Track

1. Ga naar **"Production"** in het linker menu
2. Klik op **"Create new release"**
3. Upload je **AAB bestand** (of APK):
   - Sleep het bestand naar het upload veld
   - Of klik "Browse files"
4. Vul **Release notes** in:
   - Wat is nieuw in deze versie?
   - Bijv: "Initial release" of "Bug fixes and improvements"

### 6.2 Review Information

1. Ga naar **"App content"** > **"Privacy Policy"**
2. Voeg je privacy policy URL toe
3. Beantwoord vragen over:
   - Data collection
   - Permissions
   - Content

### 6.3 Pre-launch Report (Aanbevolen)

Google test automatisch je app op verschillende devices:
1. Ga naar **"Pre-launch report"**
2. Wacht tot Google je app heeft getest
3. Los eventuele crashes op

---

## ✅ Stap 7: Pre-Submission Checklist

Voordat je submit, controleer:

### Technisch
- [ ] Release build werkt zonder crashes
- [ ] Alle features getest
- [ ] Version code verhoogd
- [ ] Version name correct
- [ ] Keystore veilig opgeslagen (backup gemaakt!)

### Assets
- [ ] App icon 512x512 geüpload
- [ ] Feature graphic 1024x500 geüpload
- [ ] Minimaal 2 screenshots geüpload
- [ ] Alle screenshots juiste afmetingen

### Content
- [ ] App description compleet
- [ ] Short description ingevuld
- [ ] Privacy policy URL werkt en is toegankelijk
- [ ] Contact email correct
- [ ] Website URL werkt (als toegevoegd)

### Legal
- [ ] Privacy policy beschikbaar en compleet
- [ ] Content rating voltooid
- [ ] Export compliance beantwoord (als van toepassing)

### Metadata
- [ ] App name correct
- [ ] Categorie geselecteerd
- [ ] Tags toegevoegd (optioneel)
- [ ] Release notes geschreven

---

## 🚀 Stap 8: Submit voor Review

1. Ga naar **"Production"** tab
2. Controleer dat alles groen is (geen waarschuwingen)
3. Klik op **"Review release"**
4. Controleer alle informatie
5. Klik op **"Start rollout to Production"**

**Review tijd:**
- Eerste submission: 1-7 dagen
- Updates: Meestal 1-3 dagen
- Soms langer bij complexe apps

---

## ⚠️ Veelvoorkomende Problemen

### 1. Keystore Verloren
**Probleem**: Je kunt geen updates meer uitbrengen
**Oplossing**: 
- Als je keystore kwijt bent, moet je een NIEUWE app aanmaken
- **Daarom**: Maak altijd backups!

### 2. Privacy Policy Ontbreekt
**Probleem**: App wordt afgewezen
**Oplossing**: 
- Maak een privacy policy
- Host het publiek toegankelijk
- Voeg URL toe in Play Console

### 3. App Crashes bij Review
**Probleem**: Reviewers kunnen app niet testen
**Oplossing**:
- Test zelf op verschillende devices
- Gebruik Pre-launch report
- Zorg voor demo account (als login vereist)

### 4. Version Code Conflict
**Probleem**: "Version code already used"
**Oplossing**:
- Verhoog `versionCode` in build.gradle
- Rebuild en upload opnieuw

### 5. Target SDK Te Laag
**Probleem**: "Target SDK must be 33 or higher"
**Oplossing**:
- Update `targetSdkVersion` in build.gradle
- Test opnieuw

---

## 📋 Version Management

Bij elke update:

1. **Verhoog `versionCode`** in `android/app/build.gradle`:
   ```gradle
   versionCode 2  // Was 1, nu 2
   versionName "1.0.1"  // Update versie nummer
   ```

2. **Build nieuwe release**:
   ```bash
   ./gradlew bundleRelease
   ```

3. **Upload naar Play Console**:
   - Ga naar Production > Create new release
   - Upload nieuwe AAB
   - Voeg release notes toe

4. **Submit voor review**

---

## 🎯 Snelle Commands

```bash
# Sync Capacitor
npx cap sync android

# Build release AAB
cd android && ./gradlew bundleRelease

# Build release APK (alternatief)
cd android && ./gradlew assembleRelease

# Test APK installeren
adb install android/app/build/outputs/apk/release/app-release.apk

# Open Android Studio (optioneel)
npx cap open android
```

---

## 📞 Hulp & Resources

- **Google Play Console**: https://play.google.com/console
- **Play Console Help**: https://support.google.com/googleplay/android-developer
- **Android Developer Guide**: https://developer.android.com/distribute/googleplay
- **Policy Center**: https://play.google.com/about/developer-content-policy/

---

## ⏱️ Tijdlijn

- **Account Setup**: 1 dag (direct actief na betaling)
- **Build & Upload**: 1-2 uur
- **Play Console Setup**: 2-4 uur
- **Content Rating**: 1-24 uur (automatisch)
- **Review**: 1-7 dagen (eerste submission)
- **Totaal**: ~1-2 weken

**Succes met je submission! 🚀**

---

## 🔐 Keystore Backup Checklist

**BELANGRIJK**: Zonder keystore kun je NOOIT MEER updates uitbrengen!

- [ ] Keystore bestand (`gymvision-release-key.jks`) opgeslagen
- [ ] Wachtwoord opgeslagen (veilig, versleuteld)
- [ ] Backup op cloud storage (Google Drive, Dropbox, etc.)
- [ ] Backup op externe harde schijf
- [ ] Fysieke backup (print details uit)
- [ ] `key.properties` NIET in git (staat in .gitignore)

**Als je keystore kwijt raakt:**
- Je kunt geen updates meer uitbrengen voor die app
- Je moet een NIEUWE app aanmaken met nieuwe package name
- Alle bestaande gebruikers moeten de nieuwe app installeren

**Daarom: BEWAAR HET VEILIG!** 🔒

