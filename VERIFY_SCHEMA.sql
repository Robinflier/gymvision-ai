-- ============================================
-- Verify Current Schema
-- Run this to check what tables/columns exist
-- ============================================

-- Check if weights table exists
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'weights'
ORDER BY ordinal_position;

-- Check workouts table structure
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'workouts'
ORDER BY ordinal_position;

-- Check workout_exercises table
SELECT 
    table_name,
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
    rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('weights', 'workouts', 'workout_exercises');

