-- ============================================
-- Supabase Schema Migration
-- Fix database structure for GymVision AI app
-- ============================================

-- 1. Create the weights table
CREATE TABLE IF NOT EXISTS weights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date date NOT NULL,
  weight numeric NOT NULL,
  inserted_at timestamp DEFAULT now()
);

-- 2. Drop existing workouts table if it exists (to recreate with correct structure)
-- Note: This will delete all existing workout data!
DROP TABLE IF EXISTS workouts CASCADE;

-- Create the workouts table with correct structure
-- Note: Adding 'exercises' JSONB column for backward compatibility with current app
-- The app currently stores exercises as JSON array in workouts table
CREATE TABLE workouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date date NOT NULL,
  name text,
  exercises jsonb,  -- For backward compatibility with current app structure
  duration numeric,  -- Workout duration in milliseconds
  total_volume numeric,
  inserted_at timestamp DEFAULT now()
);

-- 3. Create the workout_exercises table
CREATE TABLE IF NOT EXISTS workout_exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_id uuid NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  name text,
  sets jsonb,
  inserted_at timestamp DEFAULT now()
);

-- 4. Enable Row Level Security on all tables
ALTER TABLE weights ENABLE ROW LEVEL SECURITY;
ALTER TABLE workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_exercises ENABLE ROW LEVEL SECURITY;

-- 5. Drop existing policies if they exist (to recreate them)
DROP POLICY IF EXISTS "Users can view own weights" ON weights;
DROP POLICY IF EXISTS "Users can insert own weights" ON weights;
DROP POLICY IF EXISTS "Users can update own weights" ON weights;
DROP POLICY IF EXISTS "Users can delete own weights" ON weights;

DROP POLICY IF EXISTS "Users can view own workouts" ON workouts;
DROP POLICY IF EXISTS "Users can insert own workouts" ON workouts;
DROP POLICY IF EXISTS "Users can update own workouts" ON workouts;
DROP POLICY IF EXISTS "Users can delete own workouts" ON workouts;

DROP POLICY IF EXISTS "Users can view own workout_exercises" ON workout_exercises;
DROP POLICY IF EXISTS "Users can insert own workout_exercises" ON workout_exercises;
DROP POLICY IF EXISTS "Users can update own workout_exercises" ON workout_exercises;
DROP POLICY IF EXISTS "Users can delete own workout_exercises" ON workout_exercises;

-- 6. Create RLS policies for weights table
CREATE POLICY "Users can view own weights"
  ON weights FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own weights"
  ON weights FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own weights"
  ON weights FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own weights"
  ON weights FOR DELETE
  USING (auth.uid() = user_id);

-- 7. Create RLS policies for workouts table
CREATE POLICY "Users can view own workouts"
  ON workouts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own workouts"
  ON workouts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own workouts"
  ON workouts FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own workouts"
  ON workouts FOR DELETE
  USING (auth.uid() = user_id);

-- 8. Create RLS policies for workout_exercises table
-- Note: Users can only access exercises for their own workouts
CREATE POLICY "Users can view own workout_exercises"
  ON workout_exercises FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM workouts
      WHERE workouts.id = workout_exercises.workout_id
      AND workouts.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own workout_exercises"
  ON workout_exercises FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workouts
      WHERE workouts.id = workout_exercises.workout_id
      AND workouts.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own workout_exercises"
  ON workout_exercises FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM workouts
      WHERE workouts.id = workout_exercises.workout_id
      AND workouts.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workouts
      WHERE workouts.id = workout_exercises.workout_id
      AND workouts.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own workout_exercises"
  ON workout_exercises FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM workouts
      WHERE workouts.id = workout_exercises.workout_id
      AND workouts.user_id = auth.uid()
    )
  );

-- 9. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_weights_user_id ON weights(user_id);
CREATE INDEX IF NOT EXISTS idx_weights_date ON weights(date);
CREATE INDEX IF NOT EXISTS idx_workouts_user_id ON workouts(user_id);
CREATE INDEX IF NOT EXISTS idx_workouts_date ON workouts(date);
CREATE INDEX IF NOT EXISTS idx_workout_exercises_workout_id ON workout_exercises(workout_id);

-- 10. Add comments for documentation
COMMENT ON TABLE weights IS 'User weight tracking data';
COMMENT ON TABLE workouts IS 'User workout sessions';
COMMENT ON TABLE workout_exercises IS 'Exercises within a workout session';

