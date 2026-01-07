# App Store Connect Setup - GymVision AI

## Stap 1: App toevoegen in App Store Connect

1. Ga naar [App Store Connect](https://appstoreconnect.apple.com)
2. Klik op de **"Add Apps"** knop (of het **+** icoon naast "Apps")
3. Selecteer **"New App"**
4. Vul de volgende gegevens in:
   - **Platform**: iOS
   - **Name**: GymVision AI
   - **Primary Language**: Nederlands (of Engels, afhankelijk van je voorkeur)
   - **Bundle ID**: Selecteer `com.gymvision.ai` (of maak deze eerst aan in Certificates, Identifiers & Profiles)
   - **SKU**: Een unieke identifier (bijv. `gymvision-ai-001`)
   - **User Access**: Volledige toegang

5. Klik op **"Create"**

## Stap 2: Bundle ID registreren (als deze nog niet bestaat)

Als de Bundle ID `com.gymvision.ai` nog niet bestaat:

1. Ga naar [Apple Developer Portal](https://developer.apple.com/account)
2. Ga naar **Certificates, Identifiers & Profiles**
3. Klik op **Identifiers** → **+** (nieuwe identifier)
4. Selecteer **App IDs** → **Continue**
5. Selecteer **App** → **Continue**
6. Vul in:
   - **Description**: GymVision AI
   - **Bundle ID**: `com.gymvision.ai` (Explicit)
7. Selecteer de benodigde capabilities (bijv. Camera, Photo Library)
8. Klik op **Continue** → **Register**

## Stap 3: Xcode configureren

1. Open `ios/App/App.xcworkspace` in Xcode (NIET .xcodeproj!)
2. Selecteer het **App** project in de linker navigator
3. Selecteer het **App** target
4. Ga naar het **Signing & Capabilities** tabblad
5. Vink **"Automatically manage signing"** aan
6. Selecteer je **Team** (je Apple Developer account)
7. Controleer dat **Bundle Identifier** `com.gymvision.ai` is
8. Controleer dat **Version** en **Build** nummers zijn ingesteld:
   - **Version**: 1.0.0 (of hoger)
   - **Build**: 1 (of hoger)

## Stap 4: Archive maken en uploaden

1. In Xcode, selecteer **Product** → **Scheme** → **App**
2. Selecteer **Any iOS Device** (of een specifiek device) in de device selector (niet een simulator!)
3. Ga naar **Product** → **Archive**
4. Wacht tot het archive proces klaar is
5. Het **Organizer** venster opent automatisch
6. Selecteer je archive en klik op **"Distribute App"**
7. Kies **"App Store Connect"** → **Next**
8. Kies **"Upload"** → **Next**
9. Selecteer je distributie opties:
   - ✅ **Upload your app's symbols** (aanbevolen)
   - ✅ **Manage Version and Build Number** (optioneel)
10. Klik op **Next**
11. Controleer de informatie en klik op **Upload**
12. Wacht tot de upload voltooid is (kan enkele minuten duren)

## Stap 5: App configureren in App Store Connect

Na de upload (kan 10-30 minuten duren voordat de build verschijnt):

1. Ga terug naar App Store Connect
2. Open je app (GymVision AI)
3. Ga naar **App Store** tabblad
4. Vul de vereiste informatie in:
   - **App Information**: Categorieën, privacy policy URL, etc.
   - **Pricing and Availability**: Prijs en beschikbaarheid
   - **App Privacy**: Privacy details
   - **Version Information**: 
     - Screenshots (vereist voor verschillende schermformaten)
     - Beschrijving
     - Keywords
     - Support URL
     - Marketing URL (optioneel)
     - App Icon (vereist)
     - Age Rating

5. Selecteer je geüploade build in **Build**
6. Klik op **"Submit for Review"**

## Belangrijke notities:

- **Screenshots**: Je hebt screenshots nodig voor:
  - iPhone 6.7" (iPhone 14 Pro Max, etc.)
  - iPhone 6.5" (iPhone 11 Pro Max, etc.)
  - iPhone 5.5" (iPhone 8 Plus, etc.)
  - iPad Pro 12.9" (als je iPad ondersteunt)

- **App Icon**: 1024x1024 pixels, PNG formaat, geen transparantie

- **Privacy Policy**: Vereist als je gebruikersdata verzamelt (camera, foto's, etc.)

- **Review tijd**: Eerste review kan 1-3 dagen duren

## Troubleshooting

### "No matching provisioning profile found"
- Controleer dat je Team correct is geselecteerd in Xcode
- Zorg dat de Bundle ID bestaat in je Apple Developer account

### "Bundle ID already exists"
- De Bundle ID is al geregistreerd, gebruik deze gewoon

### Build verschijnt niet in App Store Connect
- Wacht 10-30 minuten na upload
- Controleer de email voor eventuele foutmeldingen
- Ga naar **Activity** tab in App Store Connect om de status te zien

### Archive optie is grijs
- Zorg dat je een fysiek device of "Any iOS Device" hebt geselecteerd (niet een simulator)
- Zorg dat je het .xcworkspace bestand opent, niet .xcodeproj




