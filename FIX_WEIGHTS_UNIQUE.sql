-- ============================================
-- Fix weights table: ensure max 1 entry per day per user
-- Run this in Supabase SQL Editor
-- ============================================

-- Step 1: Remove duplicate entries, keeping only the most recent one per user per date
-- This deletes older entries if there are multiple entries for the same user+date
DELETE FROM public.weights w1
WHERE EXISTS (
  SELECT 1
  FROM public.weights w2
  WHERE w2.user_id = w1.user_id
    AND w2.date = w1.date
    AND w2.inserted_at > w1.inserted_at
);

-- Step 2: Add unique constraint to prevent future duplicates
-- This ensures only one weight entry per user per date
DO $$
BEGIN
  -- Check if constraint already exists
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'weights_user_date_unique'
  ) THEN
    ALTER TABLE public.weights
    ADD CONSTRAINT weights_user_date_unique
    UNIQUE (user_id, date);
  END IF;
END $$;

-- Step 3: Refresh schema cache
NOTIFY pgrst, 'reload schema';

