# Admin Setup - Simpele Versie

## Optie 1: Gebruik je Email (AANBEVOLEN - Makkelijkst!)

1. Ga naar Render Dashboard → Je service → Environment
2. Voeg een nieuwe environment variable toe:
   - **Key:** `ADMIN_USER_EMAILS`
   - **Value:** Je email adres (bijv. `jouw-email@example.com`)
3. Save & Redeploy
4. Klaar! Je kunt nu naar `/admin-panel` gaan

## Optie 2: Gebruik je User ID

Als je je User ID wilt gebruiken:
1. Ga naar `/my-user-id` en log in
2. Kopieer je User ID
3. Ga naar Render Dashboard → Je service → Environment
4. Voeg een nieuwe environment variable toe:
   - **Key:** `ADMIN_USER_IDS`
   - **Value:** Je User ID (bijv. `12345678-1234-1234-1234-123456789abc`)
5. Save & Redeploy

## Meerdere Admins

Voor meerdere admins, gebruik komma's:
- `ADMIN_USER_EMAILS`: `admin1@example.com,admin2@example.com`
- `ADMIN_USER_IDS`: `id1,id2,id3`

## Testen

Na deployen, ga naar: `https://jouw-app-url.onrender.com/admin-panel`

Als je ingelogd bent met je admin email/ID, zie je het admin panel!
