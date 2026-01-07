-- ============================================
-- Fix User Table and Foreign Key Constraints
-- Creates public.users table and syncs with auth.users
-- ============================================

-- Step 1: Create public.users table that references auth.users
CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  created_at timestamptz DEFAULT now()
);

-- Step 2: Enable RLS on users table
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Step 3: Create policy for users to see their own record
DROP POLICY IF EXISTS "Users can view own user record" ON public.users;
CREATE POLICY "Users can view own user record"
  ON public.users FOR SELECT
  USING (auth.uid() = id);

-- Step 4: Create a function to automatically create user record on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO UPDATE SET email = NEW.email;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 5: Create trigger to run the function on new user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Step 6: For existing users: Insert them into public.users if they don't exist
INSERT INTO public.users (id, email)
SELECT id, email
FROM auth.users
WHERE id NOT IN (SELECT id FROM public.users)
ON CONFLICT (id) DO NOTHING;

-- Step 7: Update foreign key constraints to point to public.users
-- Drop old constraints
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

-- Step 8: Verify the setup
SELECT 'Setup complete! Users table created and foreign keys updated.' as status;

