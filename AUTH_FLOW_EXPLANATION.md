# Auth Flow Uitleg

## Wat gebruiken we nu?

### Database:
- **Supabase PostgreSQL** - voor workouts, weights, progress data
- **SQLite (lokale database)** - voor user accounts (email, username, password)

### Authentication:
- **Onze eigen auth systeem** - login/register via Flask backend
- **NIET Supabase Auth** - we gebruiken Supabase alleen voor data opslag

### Email:
- **Resend** - voor het versturen van verification codes en password reset codes

## Complete Flow:

### 1. Registratie (Register):
```
Frontend (app.js) 
  → POST /register (Flask backend)
  → Slaat user op in SQLite database
  → Genereert verification code
  → Stuurt email via Resend
  → Gebruiker verifieert email
  → User kan inloggen
```

### 2. Login:
```
Frontend (app.js)
  → POST /login (Flask backend)
  → Checkt SQLite database
  → Als correct → login_user() (Flask-Login)
  → Redirect naar workouts screen
```

### 3. Password Reset:
```
Frontend (app.js)
  → POST /api/forgot-password (Flask backend)
  → Genereert 6-cijferige code
  → Slaat code op in SQLite (verification_codes table)
  → Stuurt email via Resend
  → Gebruiker voert code in
  → POST /api/reset-password (Flask backend)
  → Update password in SQLite database
```

### 4. Data Opslag (Workouts, Weights, etc.):
```
Frontend (app.js)
  → Supabase Client (direct naar Supabase PostgreSQL)
  → Alle data wordt opgeslagen in Supabase
  → Gefilterd per user_id
```

## Waarom deze setup?

- **Supabase voor data**: Betrouwbare cloud database, makkelijk te schalen
- **Eigen auth**: Volledige controle over user accounts
- **Resend voor email**: Betrouwbaarder dan SMTP

## Probleem dat we net hebben gefixt:

De frontend probeerde Supabase Auth te gebruiken (`supabaseClient.auth.signUp`), maar de backend verwachtte een POST naar `/register`. Dit is nu gefixt - de frontend gebruikt nu de Flask backend endpoints.

