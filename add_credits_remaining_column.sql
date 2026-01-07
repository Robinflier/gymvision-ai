-- Add credits_remaining column to existing user_credits table
-- Run this in Supabase SQL Editor

-- Check if column already exists, if not add it
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'user_credits' 
        AND column_name = 'credits_remaining'
    ) THEN
        ALTER TABLE public.user_credits 
        ADD COLUMN credits_remaining INTEGER DEFAULT 10;
        
        -- Calculate credits_remaining from existing data
        -- If free_credits_used exists, use it: 10 - free_credits_used + paid_credits
        -- Otherwise default to 10
        UPDATE public.user_credits
        SET credits_remaining = COALESCE(
            10 - COALESCE(free_credits_used, 0) + COALESCE(paid_credits, 0),
            10
        )
        WHERE credits_remaining IS NULL;
    END IF;
END $$;

-- Verify the column was added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'user_credits'
ORDER BY ordinal_position;

