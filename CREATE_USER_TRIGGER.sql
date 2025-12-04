-- ============================================
-- Create trigger to auto-create public.users entry when Supabase Auth user signs up
-- Run this in Supabase SQL Editor
-- ============================================

-- Step 1: Ensure public.users table exists with correct structure
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 1b: Add username column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'users' 
        AND column_name = 'username'
    ) THEN
        ALTER TABLE public.users ADD COLUMN username TEXT;
    END IF;
END $$;

-- Step 2: Create function to handle new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, username)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1))
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 3: Create trigger that fires when a new user is created in auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- Step 4: Enable RLS on public.users
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Step 5: Create RLS policies
-- Policy: Users can read their own data
DROP POLICY IF EXISTS "Users can read own data" ON public.users;
CREATE POLICY "Users can read own data"
    ON public.users
    FOR SELECT
    USING (auth.uid() = id);

-- Policy: Users can update their own data
DROP POLICY IF EXISTS "Users can update own data" ON public.users;
CREATE POLICY "Users can update own data"
    ON public.users
    FOR UPDATE
    USING (auth.uid() = id);

-- Step 6: Migrate existing auth.users to public.users (if any exist)
-- First ensure username column exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'users' 
        AND column_name = 'username'
    ) THEN
        ALTER TABLE public.users ADD COLUMN username TEXT;
    END IF;
END $$;

-- Now insert existing users
INSERT INTO public.users (id, email, username)
SELECT 
    id,
    email,
    COALESCE(raw_user_meta_data->>'username', split_part(email, '@', 1)) as username
FROM auth.users
WHERE id NOT IN (SELECT id FROM public.users)
ON CONFLICT (id) DO NOTHING;

-- Step 7: Refresh schema cache
NOTIFY pgrst, 'reload schema';

-- ============================================
-- Done! Now when a user signs up via Supabase Auth:
-- 1. User is created in auth.users (automatic)
-- 2. Trigger fires automatically
-- 3. Entry is created in public.users (automatic)
-- 4. User can now use the app!
-- ============================================

