# 🔄 Hugging Face Token Refreshen

## ⚠️ Belangrijk: Tokens hoeven NIET gerefreshed te worden!

Hugging Face tokens blijven **geldig totdat je ze verwijdert**. Er is geen automatische expiry.

**"Last Refreshed Date"** betekent alleen wanneer de token voor het laatst is aangemaakt of gewijzigd, niet dat hij verloopt.

---

## 🔄 Als Je Toch Een Nieuwe Token Wilt Maken

### **Optie 1: Nieuwe Token Maken (Aanbevolen)**

1. **Ga naar:** https://huggingface.co/settings/tokens
2. **Klik:** "+ Create new token"
3. **Vul in:**
   - **Name:** `gymvision-v2` (of andere naam)
   - **Type:** "Read" (genoeg voor Inference API)
   - **Permissions:** Alleen "Make calls to Inference Providers" aanvinken
4. **Klik:** "Create token"
5. **Copy de nieuwe token** (begint met `hf_`)
6. **Update in Render:**
   - Render Dashboard → Environment
   - Zoek `HUGGINGFACE_API_TOKEN`
   - Update de waarde naar de nieuwe token
   - Save → Render redeployt automatisch

### **Optie 2: Oude Token Verwijderen + Nieuwe Maken**

1. **Verwijder oude token:**
   - Klik op de 3 dots (⋮) naast je token
   - Klik "Delete"
   - Bevestig

2. **Maak nieuwe token:**
   - Klik "+ Create new token"
   - Volg stappen hierboven

---

## ✅ Check Of Token Werkt

**Test endpoint:**
```bash
curl https://gymvision-ai.onrender.com/health
```

**Response moet zijn:**
```json
{
  "huggingface_available": true
}
```

**Of test AI detect in app:**
- Als het werkt = token is goed
- Als het niet werkt = check Render logs voor errors

---

## 💡 Waarom Refreshen?

**Je hoeft NIET te refreshen als:**
- ✅ Token werkt (AI detect werkt)
- ✅ Geen errors in logs
- ✅ Health endpoint: `huggingface_available: true`

**Refresh alleen als:**
- ⚠️ Token is gelekt/gecompromitteerd
- ⚠️ Je wilt andere permissions
- ⚠️ Token werkt niet meer (check eerst logs!)

---

## 🎯 Conclusie

**Je huidige token werkt waarschijnlijk prima!** 

"Last Refreshed Date: about 1 hour ago" betekent alleen dat je de token 1 uur geleden hebt aangemaakt, niet dat hij verloopt.

**Als AI detect werkt → token is goed, geen refresh nodig!**

---

*Laatste update: Januari 2026*

