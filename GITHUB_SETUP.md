# GitHub Setup voor Backend Deployment

## Optie 1: Nieuwe Repo Maken (Aanbevolen)

### Stap 1: Maak nieuwe repo op GitHub
1. Ga naar https://github.com
2. Log in met je account (of maak nieuw account)
3. Klik "New repository" (groene knop rechtsboven)
4. Repository name: `gymvision-ai` (of andere naam)
5. Kies "Private" of "Public" (maakt niet uit voor Railway)
6. **NIET** "Initialize with README" aanvinken
7. Klik "Create repository"

### Stap 2: Push je code
```bash
cd /Users/robinflier/Documents/GV_AI

# Verwijder oude remote (als die er is)
git remote remove origin

# Voeg nieuwe remote toe
git remote add origin https://github.com/JOUW-USERNAME/gymvision-ai.git

# Push code
git add .
git commit -m "Initial commit - GymVision AI backend"
git push -u origin main
```

---

## Optie 2: Bestaande Repo Gebruiken

Als je dezelfde repo wilt gebruiken:
```bash
cd /Users/robinflier/Documents/GV_AI
git add .
git commit -m "Add backend files"
git push origin main
```

---

## Welk GitHub Account?

**Het maakt niet uit!** Je kunt:
- ✅ Je bestaande account gebruiken
- ✅ Een nieuw account maken (gratis)
- ✅ Een speciaal account voor dit project maken

**Railway vraagt alleen:**
- Toegang tot je GitHub repos (je kiest welke)
- Of je wilt deployen vanuit een specifieke repo

**Je kunt altijd:**
- Later een andere repo toevoegen
- De deployment verwijderen
- Een ander account gebruiken

---

## Railway Login

1. Ga naar https://railway.app
2. Klik "Login with GitHub"
3. Railway vraagt toestemming voor GitHub access
4. Je kunt kiezen:
   - **Alle repos** (makkelijker)
   - **Alleen specifieke repos** (veiliger)

5. Railway gebruikt je GitHub account alleen om:
   - Je code te clonen
   - Automatisch te deployen bij updates
   - Je repos te tonen in dashboard

**Je GitHub account blijft privé - Railway ziet alleen wat je toestaat!**

---

## Veiligheid

- Railway krijgt alleen **read access** tot je repos
- Je kunt altijd toegang intrekken in GitHub settings
- Je kunt specifieke repos selecteren
- Environment variables (API keys) blijven privé in Railway

---

## Quick Start

**Als je nog geen GitHub repo hebt:**

1. Maak account op GitHub (of log in)
2. Maak nieuwe repo: `gymvision-ai`
3. Push code (zie Stap 2 hierboven)
4. Log in op Railway met GitHub
5. Selecteer je nieuwe repo
6. Deploy!

**Tijd: ~5 minuten**

