# Check Email Configuration

## 🔍 Probleem: Geen email ontvangen

Als je geen email ontvangt, check dit:

### 1. Check Render Logs
1. Ga naar Render Dashboard → je service → **"Logs"**
2. Zoek naar:
   - `[WARNING] Email not configured. MAIL_USERNAME or MAIL_PASSWORD is empty.`
   - `[ERROR] Failed to send password reset email:`
   - `[WARNING] Email failed. Reset code for ...`

### 2. Check Environment Variables in Render
Ga naar Render → Environment en check of deze zijn ingesteld:
- `MAIL_USERNAME` - je email adres (bijv. `your-email@gmail.com`)
- `MAIL_PASSWORD` - je email wachtwoord of App Password

### 3. Gmail App Password Setup
Als je Gmail gebruikt:
1. Ga naar: https://myaccount.google.com/apppasswords
2. Maak een nieuwe App Password aan
3. Kopieer de 16-cijferige code
4. Gebruik deze als `MAIL_PASSWORD` in Render (niet je normale wachtwoord!)

### 4. Fallback: Code in UI
Als email faalt, wordt de code nu getoond in de UI op het reset password scherm als oranje waarschuwing.

### 5. Test Email Configuratie
Check Render logs na het klikken op "Send Reset Code":
- Als je ziet: `[WARNING] Email not configured` → voeg `MAIL_USERNAME` en `MAIL_PASSWORD` toe
- Als je ziet: `[ERROR] Failed to send password reset email:` → check email configuratie
- Als je ziet: `[SUCCESS] Password reset code sent` → email is verstuurd (check spam folder)

