-- Gym Accounts Schema for Supabase
-- This extends the gym_analytics system to allow gyms to have their own accounts
-- Run this SQL in your Supabase SQL Editor AFTER running gym_analytics_table.sql

-- Add gym_id column to gym_analytics to link users to gym accounts
ALTER TABLE gym_analytics 
ADD COLUMN IF NOT EXISTS gym_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_gym_analytics_gym_id ON gym_analytics(gym_id);

-- Function to automatically link users to gym accounts based on gym_name
-- This will be called when a user updates their gym_name
CREATE OR REPLACE FUNCTION link_user_to_gym_account()
RETURNS TRIGGER AS $$
DECLARE
    matching_gym_id UUID;
BEGIN
    -- Only process if gym_name is set and consent is given
    IF NEW.gym_name IS NOT NULL AND NEW.data_collection_consent = true THEN
        -- Find gym account by matching gym_name in raw_user_meta_data
        SELECT id INTO matching_gym_id
        FROM auth.users
        WHERE raw_user_meta_data->>'is_gym_account' = 'true'
        AND LOWER(TRIM(raw_user_meta_data->>'gym_name')) = LOWER(TRIM(NEW.gym_name))
        LIMIT 1;
        
        -- If a matching gym account is found, link the user
        IF matching_gym_id IS NOT NULL THEN
            NEW.gym_id := matching_gym_id;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth;

-- Ensure function is owned by postgres so it can read auth.users
ALTER FUNCTION link_user_to_gym_account() OWNER TO postgres;

-- Trigger to auto-link users to gym accounts
DROP TRIGGER IF EXISTS auto_link_gym_account ON gym_analytics;
CREATE TRIGGER auto_link_gym_account
    BEFORE INSERT OR UPDATE ON gym_analytics
    FOR EACH ROW
    EXECUTE FUNCTION link_user_to_gym_account();

-- View for gym accounts (users with is_gym_account = true)
CREATE OR REPLACE VIEW gym_accounts_view AS
SELECT 
    id,
    email,
    created_at,
    raw_user_meta_data->>'gym_name' as gym_name,
    raw_user_meta_data->>'contact_name' as contact_name,
    raw_user_meta_data->>'contact_phone' as contact_phone,
    raw_user_meta_data->>'is_gym_account' as is_gym_account
FROM auth.users
WHERE raw_user_meta_data->>'is_gym_account' = 'true';

-- Function to get gym dashboard statistics
CREATE OR REPLACE FUNCTION get_gym_dashboard_stats(p_gym_id UUID)
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'total_users', COUNT(*),
        'users_with_consent', COUNT(*) FILTER (WHERE data_collection_consent = true),
        'users_linked', COUNT(*) FILTER (WHERE gym_id = p_gym_id),
        'recent_users', (
            SELECT COALESCE(json_agg(json_build_object(
                'user_id', user_id,
                'gym_name', gym_name,
                'consent_given_at', consent_given_at,
                'created_at', created_at
            )), '[]'::json)
            FROM (
                SELECT user_id, gym_name, consent_given_at, created_at
                FROM gym_analytics
                WHERE gym_id = p_gym_id AND data_collection_consent = true
                ORDER BY created_at DESC
                LIMIT 10
            ) recent
        )
    ) INTO result
    FROM gym_analytics
    WHERE gym_id = p_gym_id AND data_collection_consent = true;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS Policy: Gym accounts can view their own analytics data
CREATE POLICY "Gym accounts can view their linked users"
    ON gym_analytics FOR SELECT
    USING (
        gym_id IN (
            SELECT id FROM auth.users 
            WHERE id = auth.uid() 
            AND raw_user_meta_data->>'is_gym_account' = 'true'
        )
    );
