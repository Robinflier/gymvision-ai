# Supabase Password Reset Configuratie Checklist

## ✅ Wat je moet checken in Supabase:

### 1. Redirect URLs (Authentication → URL Configuration)
Zorg dat deze URLs exact in je Redirect URLs staan:
```
https://gymvision-ai.onrender.com/reset-password
https://gymvision-ai.onrender.com/*
```

**Belangrijk:** 
- De URL moet EXACT matchen (geen trailing slash, geen http://)
- Zonder deze URLs accepteert Supabase de redirect niet

### 2. Site URL
Site URL moet zijn:
```
https://gymvision-ai.onrender.com
```

### 3. Token Expiration (Authentication → Settings)
- Check de "Password Reset Token Expiration" setting
- Standaard is dit 24 uur
- Als je een link van gisteren opent en deze is expired, is dat normaal gedrag

### 4. Email Templates (Authentication → Email Templates)
- Check of de "Reset Password" email template correct is
- De link in de email moet naar `https://gymvision-ai.onrender.com/reset-password` gaan

## 🔍 Debugging:

Als password reset niet werkt:

1. **Check de console logs** - De reset-password pagina logt nu veel details:
   - `[RESET PASSWORD] Hash params:` - Toont of er een token is
   - `[RESET PASSWORD] Session result:` - Toont of setSession succesvol was
   - `[RESET PASSWORD] Session error details:` - Toont de exacte error van Supabase

2. **Check de email link** - Rechtsklik op de link in de email → "Copy link address"
   - De URL moet `#access_token=...&type=recovery` bevatten (met hash `#`)
   - Als er geen hash is, is de Supabase configuratie niet correct

3. **Test met een nieuwe link** - Vraag een nieuwe password reset email aan en test direct

## ⚠️ Belangrijke notities:

- **Oude links**: Links van gisteren kunnen expired zijn (afhankelijk van je token expiration setting)
- **Error messages**: De pagina toont nu alleen echte Supabase errors, niet onze eigen errors
- **Token validation**: De pagina probeert altijd eerst de session te setten voordat het een error toont
