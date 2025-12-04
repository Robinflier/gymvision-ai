# Resend Email Setup

## Wat is Resend?

Resend is een moderne email API service die veel betrouwbaarder is dan SMTP. Het is makkelijker te configureren en heeft betere deliverability.

## Stap 1: Maak een Resend account

1. Ga naar https://resend.com
2. Maak een gratis account (100 emails/dag gratis)
3. Verifieer je email

## Stap 2: Maak een API Key

1. Ga naar https://resend.com/api-keys
2. Klik "Create API Key"
3. Geef het een naam: "GymVision AI"
4. Kopieer de API key (begint met `re_...`)

## Stap 3: Verifieer je domain (optioneel, maar aanbevolen)

1. Ga naar https://resend.com/domains
2. Klik "Add Domain"
3. Voeg je domain toe (bijv. `gymvision.ai`)
4. Voeg de DNS records toe die Resend vraagt
5. Wacht tot verificatie compleet is

**Of gebruik Resend's test domain:**
- Resend heeft een test domain: `onboarding@resend.dev`
- Dit werkt alleen voor development/testing
- Voor productie moet je je eigen domain verifiëren

## Stap 4: Configureer Render Environment Variables

In Render, voeg toe:
- `RESEND_API_KEY` = je Resend API key (begint met `re_...`)
- `RESEND_FROM_EMAIL` = `noreply@gymvision.ai` (of je verified domain)

**Voor testing (zonder domain verificatie):**
- `RESEND_FROM_EMAIL` = `onboarding@resend.dev`

## Stap 5: Verwijder oude SMTP variables (optioneel)

Je kunt nu verwijderen uit Render:
- `MAIL_USERNAME` (niet meer nodig)
- `MAIL_PASSWORD` (niet meer nodig)
- `MAIL_SERVER` (niet meer nodig)
- `MAIL_PORT` (niet meer nodig)

## Voordelen van Resend:

✅ Betrouwbaarder dan SMTP
✅ Makkelijker te configureren
✅ Betere deliverability (minder spam)
✅ Gratis tier: 100 emails/dag
✅ Goede API en documentatie
✅ Real-time analytics

## Testen:

Na het deployen, test de password reset functionaliteit. De emails zouden nu betrouwbaarder moeten aankomen!

