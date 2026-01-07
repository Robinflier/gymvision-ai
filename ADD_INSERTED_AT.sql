-- ============================================
-- Add inserted_at column to workouts table
-- Run this in Supabase SQL Editor
-- ============================================

-- Add inserted_at column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'workouts'
      AND column_name = 'inserted_at'
  ) THEN
    ALTER TABLE public.workouts
    ADD COLUMN inserted_at timestamp DEFAULT now();
    
    -- Set inserted_at for existing rows based on date or use current timestamp
    UPDATE public.workouts
    SET inserted_at = COALESCE(
      (date::timestamp),
      CURRENT_TIMESTAMP
    )
    WHERE inserted_at IS NULL;
  END IF;
END $$;

-- Refresh schema cache
NOTIFY pgrst, 'reload schema';

