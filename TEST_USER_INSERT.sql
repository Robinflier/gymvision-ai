-- ============================================
-- TEST: Check if INSERT policy works correctly
-- Run this in Supabase SQL Editor
-- ============================================

-- Step 1: Check if policies exist
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'users'
ORDER BY policyname;

-- Step 2: Check if trigger exists
SELECT 
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement,
  action_timing
FROM information_schema.triggers
WHERE trigger_name = 'on_auth_user_created';

-- Step 3: Check if function exists
SELECT 
  routine_name,
  routine_type,
  security_type
FROM information_schema.routines
WHERE routine_name = 'handle_new_user';

-- Step 4: Test if we can see the users table structure
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'users'
ORDER BY ordinal_position;

-- Step 5: Count current users
SELECT 
  'auth.users' as source,
  COUNT(*) as count
FROM auth.users
UNION ALL
SELECT 
  'public.users' as source,
  COUNT(*) as count
FROM public.users;

