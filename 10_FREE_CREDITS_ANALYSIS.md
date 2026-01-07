# 💰 10 Gratis Credits Per Maand: Analyse

## 🎯 Voorstel

**10 gratis credits per maand per gebruiker**
- Kosten per gebruiker: €0.05/maand (als ze alle 10 gebruiken)
- OpenAI Vision: ~€0.015 per request
- 10 × €0.015 = €0.15/maand per gebruiker (als ze alle 10 gebruiken)

---

## 📊 KOSTEN ANALYSE

### **Realistische Gebruikersstatistieken:**
- 100 geregistreerde gebruikers
- 25 DAU (25% actief)
- 12 gebruikers gebruiken AI features
- Gemiddeld: 8 AI requests/dag totaal (niet per gebruiker!)

### **Met 10 Gratis Credits/Maand:**

**Scenario 1: Conservatief (Gebruikers gebruiken gemiddeld 5 credits/maand)**
- 12 gebruikers × 5 credits = **60 credits/maand**
- Kosten: 60 × €0.015 = **€0.90/maand**
- **Zeer laag!** ✅

**Scenario 2: Realistisch (Gebruikers gebruiken gemiddeld 8 credits/maand)**
- 12 gebruikers × 8 credits = **96 credits/maand**
- Kosten: 96 × €0.015 = **€1.44/maand**
- **Nog steeds zeer laag!** ✅

**Scenario 3: Maximaal (Alle gebruikers gebruiken alle 10 credits)**
- 12 gebruikers × 10 credits = **120 credits/maand**
- Kosten: 120 × €0.015 = **€1.80/maand**
- **Nog steeds zeer laag!** ✅

**Scenario 4: Bij 500 Gebruikers (150 gebruiken AI)**
- 150 gebruikers × 8 credits = **1,200 credits/maand**
- Kosten: 1,200 × €0.015 = **€18/maand**
- **Nog steeds acceptabel!** ✅

---

## ✅ VOORDELEN

### **1. Lage Kosten** ✅
- €0.90-1.80/maand bij 100 gebruikers
- €18/maand bij 500 gebruikers
- **Zeer acceptabel!**

### **2. Marketing Waarde** ✅
- "10 gratis AI detects per maand" = goede marketing
- Gebruikers kunnen het uitproberen
- Viral potential (TikTok/Instagram)

### **3. User Experience** ✅
- Gebruikers krijgen gratis credits
- Geen teleurstelling
- Feature beschikbaar voor iedereen

### **4. Upsell Mogelijkheid** ✅
- Gebruikers die meer willen → kopen extra credits
- €5 voor 20 credits = winst mogelijkheid
- Freemium model werkt goed

### **5. Geen Abrupte Stop** ✅
- Feature blijft beschikbaar
- Geen verwijderen nodig
- Gebruikers kunnen het gebruiken

---

## ⚠️ NADELEN

### **1. Kosten Groeien Met Gebruikers** ⚠️
- 100 gebruikers: €1.80/maand
- 500 gebruikers: €18/maand
- 1,000 gebruikers: €36/maand
- 2,000 gebruikers: €72/maand

**Maar:** Nog steeds zeer laag vergeleken met andere kosten!

### **2. Gebruikers Kunnen Misbruiken** ⚠️
- 10 credits = 10 requests/maand
- Als gebruiker elke dag gebruikt = 30 requests/maand
- Maar: Je limiteert tot 10 gratis, dus max €0.15/maand per gebruiker

**Oplossing:** Hard limit van 10 credits/maand per gebruiker

---

## 💡 VERGELIJKING MET ANDERE OPTIES

| Optie | Kosten (100 users) | Marketing Waarde | UX | Aanbeveling |
|-------|-------------------|------------------|----|----| 
| **10 Gratis Credits** | €1.80/maand | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ✅ **BESTE!** |
| **Verwijderen** | €0/maand | ⭐ | ⭐⭐⭐ | ⚠️ Geen marketing |
| **Alleen OpenAI** | €3-33/maand | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⚠️ Duur |
| **Hugging Face** | €0/maand | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ❌ Werkt niet |

---

## 🎯 IMPLEMENTATIE

### **Database Schema:**
```sql
-- User credits table
CREATE TABLE user_credits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  free_credits_used_this_month INTEGER DEFAULT 0,
  paid_credits INTEGER DEFAULT 0,
  last_free_reset_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id)
);
```

### **Backend Logic:**
```python
# Check if user can use free credit
def can_use_free_credit(user_id):
    # Get user credits
    credits = get_user_credits(user_id)
    
    # Check if month has reset
    today = datetime.now().date()
    if credits.last_free_reset_date.month != today.month:
        # Reset free credits
        credits.free_credits_used_this_month = 0
        credits.last_free_reset_date = today
        save_credits(credits)
    
    # Check if user has free credits left
    return credits.free_credits_used_this_month < 10
```

### **Frontend:**
```javascript
// Show credit count
"Je hebt 7/10 gratis credits deze maand gebruikt"

// When using AI detect
if (canUseFreeCredit()) {
    // Use free credit
    await useFreeCredit();
} else if (hasPaidCredits()) {
    // Use paid credit
    await usePaidCredit();
} else {
    // Show: "Je hebt geen credits meer. Koop 20 voor €5?"
    showPurchaseModal();
}
```

---

## 📊 KOSTEN PROJECTIE

| Gebruikers | AI Users | Credits/Maand | Kosten/Maand |
|------------|----------|---------------|--------------|
| **100** | 12 | 96 | **€1.44** |
| **200** | 25 | 200 | **€3.00** |
| **500** | 60 | 480 | **€7.20** |
| **1,000** | 125 | 1,000 | **€15.00** |
| **2,000** | 250 | 2,000 | **€30.00** |

**Conclusie:** Kosten blijven zeer laag, zelfs bij 2,000 gebruikers!

---

## ✅ AANBEVELING: **DOEN!** ⭐⭐⭐⭐⭐

### **Waarom:**

1. **Zeer lage kosten** ✅
   - €1.44-30/maand (afhankelijk van gebruikers)
   - Acceptabel voor marketing waarde

2. **Marketing waarde** ✅
   - "10 gratis AI detects per maand"
   - TikTok/Instagram content mogelijk
   - App Store rankings helpen

3. **User experience** ✅
   - Gebruikers krijgen gratis credits
   - Feature beschikbaar voor iedereen
   - Geen teleurstelling

4. **Upsell mogelijkheid** ✅
   - Gebruikers die meer willen → kopen credits
   - Freemium model werkt goed

5. **Geen verwijderen nodig** ✅
   - Feature blijft beschikbaar
   - Geen code cleanup nodig

---

## 🚀 IMPLEMENTATIE PLAN

### **Stap 1: Database Schema (Supabase)**
- `user_credits` table
- Track free credits used this month
- Auto-reset elke maand

### **Stap 2: Backend API**
- `/api/credits/balance` - Check credits
- `/api/credits/use` - Use credit (free or paid)
- Auto-reset logic

### **Stap 3: Frontend**
- Show credit count: "7/10 credits gebruikt"
- Check credits before AI detect
- Show purchase modal when out of credits

### **Stap 4: OpenAI Integration**
- Use OpenAI Vision (werkt wel)
- Track usage per user
- Limit to 10 free credits/month

---

## 💰 FINALE CONCLUSIE

**10 gratis credits per maand = PERFECTE BALANS!** ✅

**Waarom:**
- ✅ Kosten: €1.44-30/maand (zeer laag!)
- ✅ Marketing: "10 gratis AI detects" = goede pitch
- ✅ UX: Gebruikers krijgen gratis credits
- ✅ Upsell: Mogelijkheid voor extra credits
- ✅ Acceptabel: Zelfs bij 2,000 gebruikers = €30/maand

**Dit is veel beter dan:**
- Verwijderen (geen marketing waarde)
- Onbeperkt gratis (kosten exploderen)
- Alleen betaald (geen gebruikers)

**Aanbeveling: IMPLEMENTEER DIT!** 🚀

---

*Laatste update: Januari 2026*

