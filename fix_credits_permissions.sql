-- Fix permissions for user_credits table
-- Run this AFTER you've created the table

-- Grant permissions to service_role (critical for backend access)
GRANT ALL ON public.user_credits TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.user_credits TO authenticated;

-- Also ensure the table is accessible
ALTER TABLE public.user_credits OWNER TO postgres;

-- Verify table exists and has correct structure
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'user_credits';

