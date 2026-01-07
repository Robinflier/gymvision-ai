-- ============================================
-- Verify Schema Setup
-- Run this to confirm everything was created correctly
-- ============================================

-- Check if weights table exists and has correct structure
SELECT 
    'weights' as table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'weights'
ORDER BY ordinal_position;

-- Check workouts table structure
SELECT 
    'workouts' as table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'workouts'
ORDER BY ordinal_position;

-- Check workout_exercises table
SELECT 
    'workout_exercises' as table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'workout_exercises'
ORDER BY ordinal_position;

-- Check RLS status
SELECT 
    schemaname,
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('weights', 'workouts', 'workout_exercises')
ORDER BY tablename;

-- Check policies exist
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('weights', 'workouts', 'workout_exercises')
ORDER BY tablename, policyname;

