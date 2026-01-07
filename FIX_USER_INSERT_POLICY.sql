-- ============================================
-- Fix User Insert Policy for Registration
-- Allows users to insert their own record in public.users
-- ============================================

-- Step 1: Create INSERT policy for users to create their own record
DROP POLICY IF EXISTS "Users can insert own user record" ON public.users;
CREATE POLICY "Users can insert own user record"
  ON public.users FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Step 2: Also allow the trigger function to insert (it uses SECURITY DEFINER)
-- The trigger should already work, but this ensures users can also insert directly if needed

-- Step 3: Verify the trigger exists and is working
SELECT 
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE trigger_name = 'on_auth_user_created';

-- Step 4: Refresh schema cache
NOTIFY pgrst, 'reload schema';

