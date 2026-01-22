-- SQL script to verify gym accounts
-- Run this in Supabase SQL Editor to verify a gym account
-- Replace 'gym-email@example.com' with the actual gym account email

-- Example: Verify a gym account by email
UPDATE auth.users
SET raw_user_meta_data = jsonb_set(
    COALESCE(raw_user_meta_data, '{}'::jsonb),
    '{is_verified}',
    'true'::jsonb
)
WHERE email = 'gym-email@example.com'
AND raw_user_meta_data->>'is_gym_account' = 'true';

-- Verify all gym accounts (use with caution - only if you trust all existing accounts)
-- UPDATE auth.users
-- SET raw_user_meta_data = jsonb_set(
--     COALESCE(raw_user_meta_data, '{}'::jsonb),
--     '{is_verified}',
--     'true'::jsonb
-- )
-- WHERE raw_user_meta_data->>'is_gym_account' = 'true';

-- Check verification status of all gym accounts
SELECT 
    email,
    raw_user_meta_data->>'gym_name' as gym_name,
    raw_user_meta_data->>'is_verified' as is_verified,
    created_at
FROM auth.users
WHERE raw_user_meta_data->>'is_gym_account' = 'true'
ORDER BY created_at DESC;
