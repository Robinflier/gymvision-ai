# 🚀 Android/Google Play Quick Start Guide

## Stap 1: Keystore Aanmaken (DOE DIT EERST!)

```bash
cd /Users/robinflier/Documents/GV_AI/android/app

# Maak keystore aan
keytool -genkey -v -keystore gymvision-release-key.jks \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias gymvision-key

# Je wordt gevraagd om:
# - Wachtwoord (BEWAAR DIT!)
# - Naam, organisatie, etc.
```

**BELANGRIJK:**
- Bewaar `gymvision-release-key.jks` VEILIG (backup maken!)
- Bewaar het wachtwoord VEILIG
- Zonder dit kun je NOOIT MEER updates uitbrengen!

## Stap 2: Key Properties Bestand

Maak `android/key.properties`:

```properties
storePassword=JE_WACHTWOORD_HIER
keyPassword=JE_WACHTWOORD_HIER
keyAlias=gymvision-key
storeFile=app/gymvision-release-key.jks
```

**Voeg toe aan .gitignore:**
```
android/key.properties
android/app/gymvision-release-key.jks
```

## Stap 3: Build.gradle Aanpassen

De build.gradle moet signing configuratie hebben. Zie GOOGLE_PLAY_STORE_GUIDE.md voor volledige instructies.

## Stap 4: Build Release

```bash
# Sync Capacitor
npx cap sync android

# Build AAB (aanbevolen)
cd android
./gradlew bundleRelease

# Output: android/app/build/outputs/bundle/release/app-release.aab
```

## Stap 5: Google Play Console

1. Account aanmaken: https://play.google.com/console ($25)
2. App aanmaken
3. Store listing invullen
4. Privacy Policy URL toevoegen (VERPLICHT!)
5. AAB uploaden
6. Submit voor review

## Volledige Guide

Zie `GOOGLE_PLAY_STORE_GUIDE.md` voor alle details.
