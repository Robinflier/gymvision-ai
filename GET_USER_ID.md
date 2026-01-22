# Hoe krijg je je User ID?

## Methode 1: Via de App (Aanbevolen)

1. **Log in** in je app (op je telefoon of in de browser)
2. Open de browser console (F12) of gebruik deze simpele truc:
3. Ga naar je app en open de Developer Tools
4. In de Console, typ dit:

```javascript
fetch('/api/my-user-id', {
  headers: {
    'Authorization': 'Bearer ' + (await supabase.auth.getSession()).data.session.access_token
  }
})
.then(r => r.json())
.then(data => {
  console.log('Je User ID:', data.user_id);
  console.log('Kopieer dit naar Render ADMIN_USER_IDS');
  alert('Je User ID: ' + data.user_id);
});
```

5. Je User ID wordt getoond in een alert en in de console

## Methode 2: Via Browser (Als je al ingelogd bent)

1. Ga naar je app in de browser
2. Open Developer Tools (F12)
3. Ga naar de **Network** tab
4. Refresh de pagina
5. Zoek naar een request naar `/api/...` 
6. Klik erop en kijk naar de **Headers** → **Request Headers** → **Authorization**
7. Kopieer de token (alles na "Bearer ")
8. Open een nieuwe tab en ga naar: `https://jouw-app-url.onrender.com/api/my-user-id`
9. Open Developer Tools → **Console**
10. Typ:

```javascript
fetch('/api/my-user-id', {
  headers: {
    'Authorization': 'Bearer PASTE_YOUR_TOKEN_HERE'
  }
})
.then(r => r.json())
.then(console.log);
```

## Methode 3: Via Supabase Dashboard (Makkelijkst!)

1. Ga naar [Supabase Dashboard](https://supabase.com/dashboard)
2. Selecteer je project
3. Ga naar **Authentication** → **Users**
4. Zoek je email adres
5. Klik op je user
6. Je User ID staat bovenaan (een lange UUID zoals: `12345678-1234-1234-1234-123456789abc`)
7. Kopieer deze ID

## Dan in Render:

1. Ga naar Render Dashboard → Je service → **Environment**
2. Voeg toe:
   - **Key:** `ADMIN_USER_IDS`
   - **Value:** Je User ID (de UUID die je hebt gekopieerd)
3. Save & Redeploy
4. Klaar!
