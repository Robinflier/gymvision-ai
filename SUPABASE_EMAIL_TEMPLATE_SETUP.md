# Supabase Email Template Setup voor Password Reset Code

## 📧 Aanpassen van Supabase Email Template

### Stap 1: Ga naar Supabase Email Templates
1. Ga naar: https://supabase.com/dashboard
2. Selecteer je project
3. Ga naar **Authentication** → **Email** → **Templates**
4. Klik op **"Reset password"** template

### Stap 2: Pas de Email Template aan

**Subject:**
```
Reset Your Password - GymVision AI
```

**Body (Source tab):**
```html
<h2>Reset Your Password</h2>

<p>You requested a password reset for your GymVision AI account.</p>

<p style="font-size: 24px; font-weight: bold; color: #7c5cff; letter-spacing: 4px; text-align: center; padding: 20px; background: #f5f5f5; border-radius: 8px; margin: 20px 0;">
{{ .Token }}
</p>

<p>Enter this 6-digit code in the app to reset your password.</p>

<p style="color: #888; font-size: 12px;">This code will expire in 15 minutes.</p>

<p style="color: #888; font-size: 12px;">If you didn't request this, please ignore this email.</p>
```

**Let op:** 
- `{{ .Token }}` wordt automatisch vervangen door Supabase met een token
- Maar we gebruiken onze eigen 6-cijferige code, dus we moeten de code via de redirect URL doorgeven

### Stap 3: Alternatief - Gebruik Custom Data

Supabase ondersteunt `data` in `resetPasswordForEmail()`. We kunnen de code doorgeven via de redirect URL:

**Template aanpassen:**
```html
<h2>Reset Your Password</h2>

<p>You requested a password reset for your GymVision AI account.</p>

<p>Your reset code is in the link below, or check the URL parameters.</p>

<p><a href="{{ .ConfirmationURL }}">Reset Password</a></p>

<p style="color: #888; font-size: 12px;">If you didn't request this, please ignore this email.</p>
```

De code wordt dan via de redirect URL doorgegeven: `?code=123456`

### Stap 4: Update Backend Redirect URL

De backend stuurt nu de code in de redirect URL, dus de Supabase email template hoeft alleen de link te tonen. De code wordt automatisch uit de URL gehaald.

## ✅ Wat er nu gebeurt:

1. Backend genereert 6-cijferige code
2. Backend roept Supabase's `resetPasswordForEmail()` aan
3. Supabase verstuurt email met link naar: `https://gymvision-ai.onrender.com/reset-password?code=123456`
4. Gebruiker klikt op link → code wordt uit URL gehaald
5. Of gebruiker ziet code direct in UI (fallback)

## 🔧 Backend gebruikt nu Supabase email service

De backend gebruikt nu Supabase's email service (betrouwbaarder dan SMTP). De code wordt altijd in de UI getoond als fallback.

