# Complete Archive Fix - Alle Problemen Oplossen

## Probleem 1: PhaseScriptExecution Failed
Dit is meestal een CocoaPods probleem.

## Probleem 2: Signing Issues
Xcode kan geen Development profile maken zonder device.

## Oplossing Stap-voor-stap

### Stap 1: Clean Build
1. In Xcode: **Product → Clean Build Folder** (Shift + Cmd + K)
2. Sluit Xcode

### Stap 2: CocoaPods opnieuw installeren
Open Terminal en voer uit:
```bash
cd /Users/robinflier/Documents/GV_AI/ios/App
pod deintegrate
pod install
```

### Stap 3: Device toevoegen (als nog niet gedaan)
1. Ga naar: https://developer.apple.com/account/resources/devices/list
2. Klik **"+"**
3. Vul in:
   - **Name**: `Dummy Device`
   - **UDID**: `76032682EF9CE1C8BD4CCAACA9C775C4338F69C5`
   - **Type**: iPhone
4. Klik **Continue → Register**

### Stap 4: Xcode opnieuw openen
1. Open Xcode
2. Open `ios/App/App.xcworkspace` (NIET .xcodeproj!)
3. Ga naar **Signing & Capabilities**
4. Klik **"Try Again"**

### Stap 5: Archive maken
1. Selecteer **"Any iOS Device (arm64)"**
2. **Product → Archive**

## Alternatieve Oplossing: Forceer Distribution Signing

Als bovenstaande niet werkt, kunnen we Archive forceren zonder Development profile:

1. In Xcode: **Product → Scheme → Edit Scheme**
2. Selecteer **"Archive"**
3. Zorg dat **Build Configuration** = **"Release"**
4. Sluit

5. Ga naar **Build Settings** tab
6. Zoek naar **"Code Signing Identity"**
7. Voor **Release** configuratie, zet op **"Apple Distribution"**
8. Zoek naar **"Provisioning Profile"**
9. Voor **Release**, zet op **"Automatic"**

9. Probeer **Product → Archive** opnieuw

## Als Niets Werkt: Handmatig Distribution Profile

1. Ga naar: https://developer.apple.com/account/resources/profiles/list
2. Klik **"+"**
3. Selecteer **"App Store"** (niet Development!)
4. Selecteer je App ID: `com.gymvision.ai`
5. Selecteer je **Distribution Certificate** (of maak er een als die niet bestaat)
6. Geef een naam: "GymVision AI App Store"
7. **Generate** → Download
8. Dubbelklik om te installeren
9. In Xcode, bij **Provisioning Profile**, selecteer dit profile




