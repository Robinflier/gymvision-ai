# Fix Capacitor.framework Not Found Error

## Het Probleem
`rsync` kan `Capacitor.framework` niet vinden tijdens Archive. Dit gebeurt vaak omdat:
1. De framework nog niet is gebouwd
2. De build cache is corrupt
3. CocoaPods is niet correct geconfigureerd

## Oplossing

### Stap 1: Clean Alles
In Xcode:
1. **Product → Clean Build Folder** (Shift + Cmd + K)
2. Sluit Xcode

### Stap 2: Verwijder Build Folders
In Terminal:
```bash
cd /Users/robinflier/Documents/GV_AI
rm -rf ios/App/build
rm -rf ios/App/DerivedData
rm -rf ~/Library/Developer/Xcode/DerivedData/App-*
```

### Stap 3: CocoaPods Opnieuw Installeren
```bash
cd /Users/robinflier/Documents/GV_AI/ios/App
pod deintegrate
pod install
```

### Stap 4: Eerst Normale Build (Belangrijk!)
In Xcode:
1. Open `ios/App/App.xcworkspace`
2. Selecteer **"Any iOS Device (arm64)"**
3. **Product → Build** (Cmd + B) - NIET Archive, eerst Build!
4. Wacht tot de build succesvol is

### Stap 5: Dan Archive
Als de normale build werkt:
1. **Product → Archive**

## Alternatief: Build Script Aanpassen

Als bovenstaande niet werkt, kunnen we de build script aanpassen om het framework pad te corrigeren.




