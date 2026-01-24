# Supabase Password Reset Configuratie

## Probleem
De password reset link geeft "Invalid or expired reset link" error, zelfs direct na het ontvangen van de email.

## Oplossing: Supabase Dashboard Configuratie

### Stap 1: Ga naar Supabase Dashboard
1. Ga naar https://supabase.com/dashboard
2. Selecteer je project: `jugdkqzhcbqbjbvktqlz`

### Stap 2: Authentication → URL Configuration
1. Klik op **Authentication** in het linker menu
2. Klik op **URL Configuration** (of **Settings** → **Auth** → **URL Configuration**)

### Stap 3: Configureer Site URL
**Site URL:**
```
https://gymvision-ai.onrender.com
```

### Stap 4: Configureer Redirect URLs
Voeg deze URLs toe aan **Redirect URLs** (één per regel):
```
https://gymvision-ai.onrender.com/reset-password
https://gymvision-ai.onrender.com/*
http://localhost:5004/reset-password
```

**Belangrijk:** 
- Zorg dat `https://gymvision-ai.onrender.com/reset-password` erin staat
- De `/*` wildcard zorgt dat alle sub-paths worden geaccepteerd
- Voeg localhost toe voor lokale ontwikkeling

### Stap 5: Email Templates (Optioneel maar Aanbevolen)
1. Ga naar **Authentication** → **Email Templates**
2. Selecteer **Reset Password** template
3. Controleer dat de template de `{{ .ConfirmationURL }}` variabele gebruikt
4. De template zou er ongeveer zo uit moeten zien:
```
Click the link below to reset your password:
{{ .ConfirmationURL }}
```

### Stap 6: Test
1. Vraag een nieuwe password reset email aan
2. Klik direct op de link in de email
3. De link zou nu moeten werken

## Debugging

Als het nog steeds niet werkt, check:

1. **Console logs:** Open browser/app console en kijk naar:
   - `[FORGOT PASSWORD] Using redirect URL: ...`
   - `[RESET PASSWORD] Hash params: ...`

2. **Email link inspecteren:** 
   - Klik rechts op de link in de email → "Copy link address"
   - Check of de URL `https://gymvision-ai.onrender.com/reset-password#access_token=...` bevat
   - Als de hash (`#`) ontbreekt, is de Supabase configuratie niet correct

3. **Supabase logs:**
   - Ga naar **Logs** → **Auth Logs** in Supabase Dashboard
   - Check of er errors zijn bij het versturen van de reset email

## Veelvoorkomende Problemen

### Probleem: Link bevat geen hash (#)
**Oplossing:** Zorg dat de redirect URL exact overeenkomt met wat in Supabase staat (inclusief trailing slash of niet)

### Probleem: "otp_expired" error
**Oplossing:** 
- Vraag een nieuwe email aan (oude links verlopen snel)
- Check Supabase email rate limits

### Probleem: Link werkt in browser maar niet in app
**Oplossing:**
- Zorg dat de app de deep link handler heeft (al geïmplementeerd)
- Check of `window.BACKEND_URL` correct is ingesteld in de app
