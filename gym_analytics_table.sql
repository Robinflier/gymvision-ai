-- Gym Analytics Table for Supabase
-- This table stores gym/sportschool data from users who have given consent
-- Run this SQL in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS gym_analytics (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    gym_name TEXT,
    gym_place_id TEXT,
    data_collection_consent BOOLEAN DEFAULT false,
    consent_given_at TIMESTAMPTZ,
    consent_revoked_at TIMESTAMPTZ,
    gym_name_updated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id)
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_gym_analytics_user_id ON gym_analytics(user_id);
CREATE INDEX IF NOT EXISTS idx_gym_analytics_gym_name ON gym_analytics(gym_name);
CREATE INDEX IF NOT EXISTS idx_gym_analytics_gym_place_id ON gym_analytics(gym_place_id);
CREATE INDEX IF NOT EXISTS idx_gym_analytics_consent ON gym_analytics(data_collection_consent) WHERE data_collection_consent = true;

-- Enable Row Level Security (RLS)
ALTER TABLE gym_analytics ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own data
CREATE POLICY "Users can view own gym data"
    ON gym_analytics FOR SELECT
    USING (auth.uid() = user_id);

-- Policy: Service role can do everything (for admin/sync operations)
CREATE POLICY "Service role full access"
    ON gym_analytics FOR ALL
    USING (true)
    WITH CHECK (true);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_gym_analytics_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at on row update
CREATE TRIGGER update_gym_analytics_timestamp
    BEFORE UPDATE ON gym_analytics
    FOR EACH ROW
    EXECUTE FUNCTION update_gym_analytics_updated_at();
