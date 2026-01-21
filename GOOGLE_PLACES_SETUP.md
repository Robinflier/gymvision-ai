# Google Places API Setup

Om de sportschool autocomplete functionaliteit te gebruiken, moet je een Google Places API key instellen.

## Stappen:

1. **Maak een Google Cloud Project aan:**
   - Ga naar [Google Cloud Console](https://console.cloud.google.com/)
   - Maak een nieuw project aan of selecteer een bestaand project

2. **Enable Google Places API:**
   - Ga naar "APIs & Services" > "Library"
   - Zoek naar "Places API"
   - Klik op "Enable"

3. **Maak een API Key:**
   - Ga naar "APIs & Services" > "Credentials"
   - Klik op "Create Credentials" > "API Key"
   - Kopieer de API key

4. **Beperk de API Key (aanbevolen voor productie):**
   - Klik op de API key die je net hebt gemaakt
   - Onder "API restrictions", selecteer "Restrict key"
   - Kies alleen "Places API"
   - Onder "Application restrictions", kun je de key beperken tot je domein (bijv. `gymvision-ai.onrender.com`)

5. **Voeg de API key toe aan je environment variables:**
   - In Render (of je hosting platform):
     - Ga naar je service settings
     - Voeg een nieuwe environment variable toe:
       - Key: `GOOGLE_PLACES_API_KEY`
       - Value: je API key
   - Voor lokale ontwikkeling:
     - Voeg toe aan je `.env` file:
       ```
       GOOGLE_PLACES_API_KEY=your_api_key_here
       ```

6. **Deploy je wijzigingen:**
   - Commit en push je code
   - De app zal automatisch de API key ophalen van de backend

## Kosten:

Google Places API heeft een gratis tier:
- $200 gratis credits per maand
- Dit is genoeg voor ongeveer 40,000 autocomplete requests per maand

Voor meer informatie: [Google Places API Pricing](https://developers.google.com/maps/documentation/places/web-service/usage-and-billing)

## Fallback:

Als de API key niet is ingesteld, werkt de input field nog steeds, maar dan als een normale tekst input zonder autocomplete. Gebruikers kunnen dan handmatig hun sportschool naam invullen.
