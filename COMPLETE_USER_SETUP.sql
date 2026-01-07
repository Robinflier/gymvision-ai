-- ============================================
-- COMPLETE USER SETUP - Fix Everything
-- Run this in Supabase SQL Editor to fix registration
-- ============================================

-- Step 1: Ensure public.users table exists with correct structure
CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  created_at timestamptz DEFAULT now()
);

-- Step 2: Enable RLS on users table
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Step 3: Drop and recreate all policies to ensure they're correct
DROP POLICY IF EXISTS "Users can view own user record" ON public.users;
DROP POLICY IF EXISTS "Users can insert own user record" ON public.users;
DROP POLICY IF EXISTS "Users can update own user record" ON public.users;

-- SELECT policy: Users can view their own record
CREATE POLICY "Users can view own user record"
  ON public.users FOR SELECT
  USING (auth.uid() = id);

-- INSERT policy: Users can insert their own record (for registration)
CREATE POLICY "Users can insert own user record"
  ON public.users FOR INSERT
  WITH CHECK (auth.uid() = id);

-- UPDATE policy: Users can update their own record
CREATE POLICY "Users can update own user record"
  ON public.users FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Step 4: Create or replace the trigger function (SECURITY DEFINER bypasses RLS)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO UPDATE SET email = NEW.email;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 5: Ensure the trigger exists and is active
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW 
  EXECUTE FUNCTION public.handle_new_user();

-- Step 6: Sync existing users from auth.users to public.users
INSERT INTO public.users (id, email)
SELECT id, email
FROM auth.users
WHERE id NOT IN (SELECT id FROM public.users WHERE id IS NOT NULL)
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

-- Step 7: Ensure foreign keys point to public.users (not auth.users)
-- Drop old constraints if they exist
ALTER TABLE public.workouts 
  DROP CONSTRAINT IF EXISTS workouts_user_id_fkey;

ALTER TABLE public.weights 
  DROP CONSTRAINT IF EXISTS weights_user_id_fkey;

-- Add correct foreign key constraints pointing to public.users
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

-- Step 8: Verify setup
SELECT 
  'Setup complete!' as status,
  (SELECT COUNT(*) FROM public.users) as users_count,
  (SELECT COUNT(*) FROM auth.users) as auth_users_count;

-- Step 9: Refresh schema cache
NOTIFY pgrst, 'reload schema';

