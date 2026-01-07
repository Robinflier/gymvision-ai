# Workaround voor Archive zonder Device

## Het Probleem
Xcode probeert een Development provisioning profile te maken, wat een device vereist. Voor Archive/App Store distribution heb je echter een **Distribution** profile nodig, wat GEEN device vereist.

## Oplossing: Forceer Distribution Signing

### Methode 1: Archive direct maken (meest eenvoudig)

De Development signing fout zou niet moeten voorkomen dat je een Archive maakt, omdat Archive automatisch Distribution signing gebruikt:

1. **Zorg dat "Any iOS Device (arm64)" is geselecteerd** (staat al goed)
2. **Ga direct naar Product → Archive**
3. Xcode zou automatisch moeten overschakelen naar Distribution signing voor Archive

### Methode 2: Handmatig Distribution Certificate maken

Als Methode 1 niet werkt:

1. Ga naar [Apple Developer Portal - Certificates](https://developer.apple.com/account/resources/certificates/list)
2. Klik op **"+"** om een nieuw certificate te maken
3. Selecteer **"Apple Distribution"** → **Continue**
4. Upload een Certificate Signing Request (CSR):
   - Op je Mac: Open **Keychain Access**
   - Ga naar **Keychain Access** → **Certificate Assistant** → **Request a Certificate From a Certificate Authority**
   - Vul je email in, kies "Saved to disk"
   - Upload dit bestand in de Developer Portal
5. Download het certificate en dubbelklik om te installeren

### Methode 3: Voeg een dummy device toe (snelste workaround)

Zelfs als je geen fysiek device hebt, kun je een device ID toevoegen:

1. Ga naar [Apple Developer Portal - Devices](https://developer.apple.com/account/resources/devices/list)
2. Klik op **"+"**
3. Vul in:
   - **Name**: "Dummy Device" (of wat je wilt)
   - **UDID**: Gebruik een willekeurige UUID (bijv. `00000000-0000-0000-0000-000000000000`)
4. Klik **Continue** → **Register**
5. Terug in Xcode: Klik **"Try Again"** in Signing & Capabilities

**Let op:** Dit device hoef je niet echt te gebruiken - het is alleen zodat Xcode een Development profile kan maken. Voor Archive gebruikt Xcode nog steeds Distribution signing.

### Methode 4: Wijzig Signing Identity handmatig (geavanceerd)

Als bovenstaande niet werkt, kunnen we de project file aanpassen om Distribution signing te forceren voor Release builds. Dit is echter complexer en kan problemen veroorzaken.

## Aanbevolen Volgorde

1. **Probeer eerst Methode 1** - Ga direct naar Product → Archive
2. **Als dat niet werkt, probeer Methode 3** - Voeg een dummy device toe
3. **Als laatste redmiddel, Methode 2** - Maak handmatig Distribution certificate

## Belangrijk

- De Development signing fout zou **NIET** moeten voorkomen dat je Archive maakt
- Archive gebruikt automatisch **Distribution** signing, wat geen devices vereist
- Als Archive nog steeds faalt, is er mogelijk een ander probleem (bijv. Bundle ID niet geregistreerd)




