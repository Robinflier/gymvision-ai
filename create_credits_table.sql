-- Create user_credits table in Supabase
-- Run this in Supabase SQL Editor

-- Drop existing table if it exists (optional, only if you want to start fresh)
-- DROP TABLE IF EXISTS public.user_credits CASCADE;

CREATE TABLE IF NOT EXISTS public.user_credits (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    credits_remaining INTEGER NOT NULL DEFAULT 10,
    last_reset_month TEXT, -- Format: "YYYY-MM" (e.g., "2026-01")
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_credits_user_id ON public.user_credits(user_id);

-- Enable Row Level Security
ALTER TABLE public.user_credits ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can read own credits" ON public.user_credits;
DROP POLICY IF EXISTS "Service role full access" ON public.user_credits;

-- Policy: Users can read their own credits
CREATE POLICY "Users can read own credits"
    ON public.user_credits
    FOR SELECT
    USING (auth.uid() = user_id);

-- Policy: Service role can do everything (for backend operations)
-- This allows the backend (using service role key) to insert, update, and delete
CREATE POLICY "Service role full access"
    ON public.user_credits
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Grant permissions to service_role (critical for backend access)
GRANT ALL ON public.user_credits TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.user_credits TO authenticated;

