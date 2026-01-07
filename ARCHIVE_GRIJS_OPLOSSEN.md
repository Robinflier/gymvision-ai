# Archive Optie Grijs - Oplossen

## Waarom is Archive grijs?

Archive is alleen beschikbaar als:
1. **"Any iOS Device (arm64)"** is geselecteerd (NIET een simulator!)
2. De build succesvol is afgerond
3. Er zijn geen kritieke fouten

## Oplossing Stap-voor-stap:

### Stap 1: Controleer Device Selectie
1. Kijk bovenaan in Xcode, naast de Play knop
2. Klik op het device dropdown menu
3. Selecteer **"Any iOS Device (arm64)"** (staat onder "Build" sectie)
4. NIET een simulator zoals "iPhone 14 Pro" of "iPhone 14"

### Stap 2: Als "Any iOS Device" niet verschijnt
1. Ga naar **Product → Destination → Add Additional Simulators...**
2. Of: Sluit Xcode en open opnieuw
3. Of: Ga naar **Window → Devices and Simulators** en verbind een fysiek device (optioneel)

### Stap 3: Clean en Build opnieuw
1. **Product → Clean Build Folder** (Shift + Cmd + K)
2. Wacht tot clean klaar is
3. **Product → Build** (Cmd + B)
4. Wacht tot build succesvol is (geen rode fouten)
5. Probeer dan **Product → Archive**

### Stap 4: Controleer Scheme
1. **Product → Scheme → Edit Scheme**
2. Selecteer **"Archive"** in linker sidebar
3. Controleer dat **Build Configuration** = **"Release"**
4. Sluit het venster
5. Probeer **Product → Archive** opnieuw

## Belangrijk:
- Archive werkt ALLEEN met "Any iOS Device" of een echt fysiek device
- Simulators kunnen NIET worden ge-archived
- Als je "iPhone 14 Pro" of een simulator ziet, selecteer dan "Any iOS Device"




