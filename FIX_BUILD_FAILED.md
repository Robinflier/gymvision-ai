# Build Failed Oplossen - Snelle Fix

## Het Probleem
Xcode kan geen Development provisioning profile maken omdat er geen devices zijn geregistreerd in je Apple Developer account.

## Oplossing: Voeg een Dummy Device toe

### Stap 1: Genereer een UUID voor het device

Open Terminal en voer dit commando uit:
```bash
uuidgen
```

Dit geeft je een unieke UUID (bijv. `A1B2C3D4-E5F6-7890-ABCD-EF1234567890`)

### Stap 2: Voeg device toe in Apple Developer Portal

1. Ga naar: https://developer.apple.com/account/resources/devices/list
2. Klik op de **"+"** knop (rechtsboven)
3. Vul in:
   - **Name**: `Dummy Device` (of wat je wilt)
   - **UDID**: Plak de UUID die je net hebt gegenereerd
4. Klik **Continue**
5. Klik **Register**

### Stap 3: Terug in Xcode

1. Ga naar **Signing & Capabilities** tab
2. Klik op de **"Try Again"** knop
3. Xcode zou nu automatisch een Development provisioning profile moeten maken

### Stap 4: Probeer Archive opnieuw

1. Zorg dat **"Any iOS Device (arm64)"** is geselecteerd
2. Ga naar **Product → Archive**

## Alternatief: Gebruik een echte Device UDID

Als je een iPhone/iPad hebt:

1. Verbind je device met je Mac via USB
2. Open Xcode → **Window → Devices and Simulators**
3. Selecteer je device in de linker sidebar
4. Kopieer de **"Identifier"** (dit is je UDID)
5. Gebruik deze UDID in stap 2 hierboven

## Waarom dit werkt

- Xcode heeft een Development provisioning profile nodig voor de build
- Een Development profile vereist minstens 1 geregistreerd device
- Het device hoeft niet echt te zijn - een dummy UUID werkt ook
- Voor Archive gebruikt Xcode nog steeds Distribution signing (geen device nodig)

## Belangrijk

- Het dummy device hoef je nooit te gebruiken
- Het is alleen zodat Xcode een Development profile kan maken
- Archive gebruikt automatisch Distribution signing




