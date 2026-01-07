# Xcode Signing Probleem Oplossen

## Probleem
- "No profiles for 'com.gymvision.ai' were found"
- "Your team has no devices from which to generate a provisioning profile"

## Oplossing Stap-voor-stap

### Optie 1: Voor App Store Archive (GEEN fysiek device nodig)

Als je alleen een archive wilt maken voor App Store Connect:

1. **Selecteer "Any iOS Device"** in Xcode (niet een simulator!)
   - Klik op het device dropdown menu (waar nu "iPhone 14 Pro Max" staat)
   - Selecteer **"Any iOS Device (arm64)"** onder de "Build" sectie

2. **Wijzig Signing voor Release build:**
   - In Xcode, ga naar **Product** → **Scheme** → **Edit Scheme**
   - Selecteer **"Archive"** in de linker sidebar
   - Zorg dat **"Build Configuration"** op **"Release"** staat
   - Klik **Close**

3. **Probeer opnieuw:**
   - Ga naar **Signing & Capabilities** tab
   - Klik op **"Try Again"** knop
   - Of: uncheck en re-check **"Automatically manage signing"**

4. **Als het nog steeds niet werkt:**
   - Ga naar [Apple Developer Portal](https://developer.apple.com/account/resources/identifiers/list)
   - Controleer dat `com.gymvision.ai` bestaat en geregistreerd is
   - Wacht 1-2 minuten en probeer opnieuw in Xcode

### Optie 2: Voor Development/Testing (WEL device nodig)

Als je de app op een fysiek device wilt testen:

1. **Registreer je iPhone/iPad:**
   - Verbind je iPhone/iPad met je Mac via USB
   - In Xcode, ga naar **Window** → **Devices and Simulators**
   - Selecteer je device in de linker sidebar
   - Klik op **"Use for Development"** (als dit verschijnt)
   - Xcode registreert je device automatisch

2. **Of registreer handmatig:**
   - Ga naar [Apple Developer Portal](https://developer.apple.com/account/resources/devices/list)
   - Klik op **"+"** om een nieuw device toe te voegen
   - Vul in:
     - **Name**: Bijv. "Robin's iPhone"
     - **UDID**: Vind je UDID via:
       - Verbind device met Mac
       - Open Xcode → Window → Devices and Simulators
       - Selecteer je device → Kopieer de "Identifier" (dit is je UDID)
   - Klik **Continue** → **Register**

3. **Terug in Xcode:**
   - Ga naar **Signing & Capabilities**
   - Klik **"Try Again"**
   - Xcode zou nu automatisch een provisioning profile moeten maken

### Optie 3: Handmatig Provisioning Profile maken (als automatisch niet werkt)

1. Ga naar [Apple Developer Portal](https://developer.apple.com/account/resources/profiles/list)
2. Klik **"+"** om een nieuw profile te maken
3. Selecteer **"iOS App Development"** → **Continue**
4. Selecteer je App ID (`com.gymvision.ai`) → **Continue**
5. Selecteer je Development Certificate → **Continue**
6. Selecteer je device(s) → **Continue**
7. Geef een naam: "GymVision AI Development" → **Generate**
8. Download het profile en dubbelklik om te installeren
9. In Xcode, ga naar **Signing & Capabilities**
10. Bij **Provisioning Profile**, selecteer het profile dat je net hebt gemaakt

## Voor Archive (App Store Upload)

**BELANGRIJK:** Voor App Store distribution hoef je GEEN fysiek device te hebben!

1. Selecteer **"Any iOS Device (arm64)"** als run destination
2. Ga naar **Product** → **Archive**
3. Als er nog steeds een fout is:
   - Controleer dat je Team correct is geselecteerd
   - Controleer dat de Bundle ID bestaat in Apple Developer Portal
   - Wacht even (soms duurt het even voordat Apple's servers zijn bijgewerkt)

## Troubleshooting

### "Communication with Apple failed"
- Controleer je internetverbinding
- Controleer dat je ingelogd bent met het juiste Apple ID in Xcode
- Ga naar **Xcode** → **Settings** → **Accounts** → Controleer je account

### "No matching provisioning profile"
- Zorg dat "Automatically manage signing" is aangevinkt
- Klik op "Try Again"
- Als het niet werkt, wacht 2-3 minuten en probeer opnieuw

### Archive optie is grijs
- Zorg dat je "Any iOS Device" hebt geselecteerd (NIET een simulator!)
- Zorg dat je het .xcworkspace bestand opent, niet .xcodeproj




