-- ============================================
-- FINAL Schema Fix for GymVision AI
-- Fixed version that handles missing inserted_at column
-- ============================================

-- Step 1: Create weights table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.weights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date date NOT NULL,
  weight numeric NOT NULL,
  inserted_at timestamp DEFAULT now()
);

-- Step 2: Add missing columns to workouts table safely
DO $$ 
BEGIN
  -- Add date column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'workouts' 
      AND column_name = 'date'
  ) THEN
    -- Add date column (nullable first)
    ALTER TABLE public.workouts ADD COLUMN date date;
    
    -- Set default date for existing rows
    -- Check if inserted_at exists, otherwise use CURRENT_DATE
    IF EXISTS (
      SELECT 1 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'workouts' 
        AND column_name = 'inserted_at'
    ) THEN
      UPDATE public.workouts 
      SET date = COALESCE(
        (inserted_at::date),
        CURRENT_DATE
      )
      WHERE date IS NULL;
    ELSE
      -- No inserted_at column, just use current date
      UPDATE public.workouts 
      SET date = CURRENT_DATE
      WHERE date IS NULL;
    END IF;
    
    -- Make date NOT NULL after setting defaults
    ALTER TABLE public.workouts ALTER COLUMN date SET NOT NULL;
  END IF;
  
  -- Add exercises column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'workouts' 
      AND column_name = 'exercises'
  ) THEN
    ALTER TABLE public.workouts ADD COLUMN exercises jsonb;
  END IF;
  
  -- Add duration column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'workouts' 
      AND column_name = 'duration'
  ) THEN
    ALTER TABLE public.workouts ADD COLUMN duration numeric;
  END IF;
  
  -- Add total_volume column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'workouts' 
      AND column_name = 'total_volume'
  ) THEN
    ALTER TABLE public.workouts ADD COLUMN total_volume numeric;
  END IF;
END $$;

-- Step 3: Create workout_exercises table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.workout_exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_id uuid NOT NULL REFERENCES public.workouts(id) ON DELETE CASCADE,
  name text,
  sets jsonb,
  inserted_at timestamp DEFAULT now()
);

-- Step 4: Enable Row Level Security
ALTER TABLE public.weights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_exercises ENABLE ROW LEVEL SECURITY;

-- Step 5: Create policies for weights (only if they don't exist)
DO $$ 
BEGIN
  -- Drop existing policies if they exist
  DROP POLICY IF EXISTS "Users can view own weights" ON public.weights;
  DROP POLICY IF EXISTS "Users can insert own weights" ON public.weights;
  DROP POLICY IF EXISTS "Users can update own weights" ON public.weights;
  DROP POLICY IF EXISTS "Users can delete own weights" ON public.weights;
END $$;

CREATE POLICY "Users can view own weights"
  ON public.weights FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own weights"
  ON public.weights FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own weights"
  ON public.weights FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own weights"
  ON public.weights FOR DELETE
  USING (auth.uid() = user_id);

-- Step 6: Create policies for workouts (only if they don't exist)
DO $$ 
BEGIN
  -- Drop existing policies if they exist
  DROP POLICY IF EXISTS "Users can view own workouts" ON public.workouts;
  DROP POLICY IF EXISTS "Users can insert own workouts" ON public.workouts;
  DROP POLICY IF EXISTS "Users can update own workouts" ON public.workouts;
  DROP POLICY IF EXISTS "Users can delete own workouts" ON public.workouts;
END $$;

CREATE POLICY "Users can view own workouts"
  ON public.workouts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own workouts"
  ON public.workouts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own workouts"
  ON public.workouts FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own workouts"
  ON public.workouts FOR DELETE
  USING (auth.uid() = user_id);

-- Step 7: Create policies for workout_exercises (only if they don't exist)
DO $$ 
BEGIN
  -- Drop existing policies if they exist
  DROP POLICY IF EXISTS "Users can view own workout_exercises" ON public.workout_exercises;
  DROP POLICY IF EXISTS "Users can insert own workout_exercises" ON public.workout_exercises;
  DROP POLICY IF EXISTS "Users can update own workout_exercises" ON public.workout_exercises;
  DROP POLICY IF EXISTS "Users can delete own workout_exercises" ON public.workout_exercises;
END $$;

CREATE POLICY "Users can view own workout_exercises"
  ON public.workout_exercises FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workouts
      WHERE public.workouts.id = public.workout_exercises.workout_id
      AND public.workouts.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own workout_exercises"
  ON public.workout_exercises FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workouts
      WHERE public.workouts.id = public.workout_exercises.workout_id
      AND public.workouts.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own workout_exercises"
  ON public.workout_exercises FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.workouts
      WHERE public.workouts.id = public.workout_exercises.workout_id
      AND public.workouts.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workouts
      WHERE public.workouts.id = public.workout_exercises.workout_id
      AND public.workouts.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own workout_exercises"
  ON public.workout_exercises FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.workouts
      WHERE public.workouts.id = public.workout_exercises.workout_id
      AND public.workouts.user_id = auth.uid()
    )
  );

-- Step 8: Create indexes (safe - won't error if they exist)
CREATE INDEX IF NOT EXISTS idx_weights_user_id ON public.weights(user_id);
CREATE INDEX IF NOT EXISTS idx_weights_date ON public.weights(date);
CREATE INDEX IF NOT EXISTS idx_workouts_user_id ON public.workouts(user_id);
CREATE INDEX IF NOT EXISTS idx_workouts_date ON public.workouts(date);
CREATE INDEX IF NOT EXISTS idx_workout_exercises_workout_id ON public.workout_exercises(workout_id);

