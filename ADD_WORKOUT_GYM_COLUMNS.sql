-- Add gym fields to workouts table (Supabase)
-- Run this in the Supabase SQL Editor.
--
-- Why: Without these columns, workouts cannot persist their gym after logout/login
-- and gym dashboard charts (filtered by workout gym) will show "No data yet".

ALTER TABLE public.workouts
ADD COLUMN IF NOT EXISTS gym_name text;

ALTER TABLE public.workouts
ADD COLUMN IF NOT EXISTS gym_place_id text;

-- Optional: helpful index for gym dashboards
CREATE INDEX IF NOT EXISTS idx_workouts_gym_name ON public.workouts (gym_name);

-- Optional: if you want to query per-gym per-user faster
CREATE INDEX IF NOT EXISTS idx_workouts_user_gym ON public.workouts (user_id, gym_name);

