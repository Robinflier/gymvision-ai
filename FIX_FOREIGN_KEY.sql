-- ============================================
-- Fix Foreign Key Constraint Issue
-- The workouts table references auth.users but we need to ensure
-- the foreign key is correct or create a public.users table
-- ============================================

-- Option 1: Check if user exists in auth.users
-- Run this to see your current user ID:
SELECT id, email FROM auth.users LIMIT 5;

-- Option 2: If the foreign key is the issue, we can:
-- A) Drop and recreate with correct reference
-- B) Or create a public.users table that syncs with auth.users

-- Let's check the current foreign key constraint:
SELECT
    tc.table_name, 
    kcu.column_name, 
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name 
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' 
  AND tc.table_name = 'workouts'
  AND tc.table_schema = 'public';

-- Option 3: Create a trigger to sync auth.users to public.users
-- This ensures there's always a matching record
CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on users table
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Create policy for users to see their own record
DROP POLICY IF EXISTS "Users can view own user record" ON public.users;
CREATE POLICY "Users can view own user record"
  ON public.users FOR SELECT
  USING (auth.uid() = id);

-- Create a function to automatically create user record on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to run the function on new user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- For existing users: Insert them into public.users if they don't exist
INSERT INTO public.users (id, email)
SELECT id, email
FROM auth.users
WHERE id NOT IN (SELECT id FROM public.users)
ON CONFLICT (id) DO NOTHING;

-- Now update the foreign key to point to public.users instead
-- First, drop the old constraint
ALTER TABLE public.workouts 
  DROP CONSTRAINT IF EXISTS workouts_user_id_fkey;

ALTER TABLE public.weights 
  DROP CONSTRAINT IF EXISTS weights_user_id_fkey;

-- Add new constraints pointing to public.users
ALTER TABLE public.workouts
  ADD CONSTRAINT workouts_user_id_fkey 
  FOREIGN KEY (user_id) 
  REFERENCES public.users(id) 
  ON DELETE CASCADE;

ALTER TABLE public.weights
  ADD CONSTRAINT weights_user_id_fkey 
  FOREIGN KEY (user_id) 
  REFERENCES public.users(id) 
  ON DELETE CASCADE;

