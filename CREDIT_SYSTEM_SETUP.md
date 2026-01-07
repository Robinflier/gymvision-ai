# 💳 Credit Systeem Setup: 10 Gratis Credits Per Maand

## 📋 Supabase Table Schema

Maak deze table aan in Supabase SQL Editor:

```sql
-- Create user_credits table
CREATE TABLE IF NOT EXISTS user_credits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  free_credits_used INTEGER NOT NULL DEFAULT 0,
  paid_credits INTEGER NOT NULL DEFAULT 0,
  last_reset_month VARCHAR(7) NOT NULL DEFAULT '', -- Format: YYYY-MM
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_credits_user_id ON user_credits(user_id);

-- Enable Row Level Security (RLS)
ALTER TABLE user_credits ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only read their own credits
CREATE POLICY "Users can view own credits"
  ON user_credits
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Service role can do everything (for backend operations)
CREATE POLICY "Service role can manage all credits"
  ON user_credits
  FOR ALL
  USING (auth.role() = 'service_role');
```

---

## 🔧 Backend API Endpoints

### 1. **GET /api/credits/balance**
Get user's credit balance.

**Response:**
```json
{
  "free_credits_used": 3,
  "free_credits_remaining": 7,
  "paid_credits": 5,
  "total_credits": 12,
  "current_month": "2026-01"
}
```

### 2. **POST /api/recognize-exercise** (Updated)
Exercise recognition with credit check.

**Request:** Form data with `image` file
**Headers:** `Authorization: Bearer <supabase_jwt_token>`

**Response (Success):**
```json
{
  "exercise": "bench press",
  "credits_remaining": 9
}
```

**Response (No Credits):**
```json
{
  "exercise": "unknown exercise",
  "error": "No credits available. You've used all 10 free credits this month.",
  "credits_remaining": 0
}
```

---

## 🎨 Frontend Implementation

### Credit Display Component

Voeg dit toe aan je UI (bijvoorbeeld in de header of settings):

```javascript
// Load credits balance
async function loadCreditsBalance() {
  const supabase = await initSupabase();
  if (!supabase) return;
  
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  
  try {
    const response = await fetch(getApiUrl('/api/credits/balance'), {
      headers: {
        'Authorization': `Bearer ${session.access_token}`
      }
    });
    
    if (response.ok) {
      const credits = await response.json();
      updateCreditsDisplay(credits);
    }
  } catch (error) {
    console.error('Failed to load credits:', error);
  }
}

// Update credits display in UI
function updateCreditsDisplay(credits) {
  const creditsElement = document.getElementById('credits-display');
  if (creditsElement) {
    creditsElement.textContent = `${credits.total_credits} credits`;
    creditsElement.title = `${credits.free_credits_remaining} free + ${credits.paid_credits} paid`;
  }
}
```

### Update AI Detect Function

Update de `recognizeExercise` functie om credits te checken:

```javascript
async function recognizeExercise(imageFile) {
  const supabase = await initSupabase();
  if (!supabase) {
    alert('Please log in to use AI detect');
    return;
  }
  
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    alert('Please log in to use AI detect');
    return;
  }
  
  // Show loading
  const button = document.getElementById('ai-detect-button');
  if (button) {
    button.disabled = true;
    button.textContent = 'Detecting...';
  }
  
  try {
    const formData = new FormData();
    formData.append('image', imageFile);
    
    const response = await fetch(getApiUrl('/api/recognize-exercise'), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`
      },
      body: formData
    });
    
    const result = await response.json();
    
    if (response.status === 403) {
      // No credits available
      alert(result.error || 'No credits available. You\'ve used all 10 free credits this month.');
      // Optionally show purchase modal
      showPurchaseCreditsModal();
      return;
    }
    
    if (result.exercise && result.exercise !== 'unknown exercise') {
      // Success - select the exercise
      selectExerciseByName(result.exercise);
      
      // Update credits display
      if (result.credits_remaining !== undefined) {
        updateCreditsDisplay({
          total_credits: result.credits_remaining,
          free_credits_remaining: Math.min(10, result.credits_remaining),
          paid_credits: Math.max(0, result.credits_remaining - 10)
        });
      }
    } else {
      alert('Could not recognize exercise. Please try again or select manually.');
    }
  } catch (error) {
    console.error('AI detect error:', error);
    alert('Failed to detect exercise. Please try again.');
  } finally {
    // Re-enable button
    if (button) {
      button.disabled = false;
      button.textContent = 'AI Detect';
    }
  }
}
```

---

## 🔄 Auto-Reset Logic

Credits worden automatisch gereset op de 1e van elke maand:

- **Check:** Bij elke credit check wordt `last_reset_month` vergeleken met huidige maand
- **Reset:** Als maand verschilt → `free_credits_used = 0`, `last_reset_month = current_month`
- **Format:** `YYYY-MM` (bijv. "2026-01", "2026-02")

**Voorbeeld:**
- Gebruiker maakt account op 15 januari → krijgt 10 gratis credits
- Gebruikt 7 credits in januari → 3 over
- Op 1 februari → automatisch reset naar 10 gratis credits
- Gebruikt 5 credits in februari → 5 over

---

## ✅ Checklist

- [ ] Supabase table `user_credits` aangemaakt
- [ ] RLS policies ingesteld
- [ ] Backend endpoints getest
- [ ] Frontend credit display toegevoegd
- [ ] AI detect functie geüpdatet met credit check
- [ ] OpenAI API key teruggezet in Render
- [ ] Test: Nieuwe gebruiker krijgt 10 credits
- [ ] Test: Credit wordt gebruikt bij AI detect
- [ ] Test: Auto-reset werkt (test met verschillende maanden)

---

## 🚀 Deployment

1. **Supabase:**
   - Run SQL schema in SQL Editor
   - Verify RLS policies

2. **Render:**
   - Zet `OPENAI_API_KEY` terug in environment variables
   - Deploy nieuwe code

3. **Test:**
   - Maak nieuwe account
   - Check credits balance
   - Test AI detect
   - Verify credit wordt gebruikt

---

*Laatste update: Januari 2026*

