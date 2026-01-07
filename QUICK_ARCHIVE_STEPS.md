# Snelle Archive Stappen

## In Edit Scheme venster:

1. **Klik op "Archive"** in de linker sidebar (niet "Run")
2. Controleer dat **Build Configuration** op **"Release"** staat
3. Klik **"Close"**

## Dan Archive maken:

1. Zorg dat **"Any iOS Device (arm64)"** is geselecteerd (niet een simulator!)
2. Ga naar **Product → Archive**
3. Wacht tot het archive proces klaar is (kan enkele minuten duren)

## Als Archive faalt:

- Controleer dat je Team correct is geselecteerd in Signing & Capabilities
- Controleer dat Bundle ID `com.gymvision.ai` bestaat in Apple Developer Portal
- Probeer de "Try Again" knop in Signing & Capabilities
- Wacht 1-2 minuten en probeer opnieuw (Apple servers moeten soms synchroniseren)

## Belangrijk:

- De Development signing waarschuwing zou Archive NIET moeten blokkeren
- Archive gebruikt automatisch Distribution signing (geen device nodig)
- Als Archive start, betekent dit dat het werkt!




