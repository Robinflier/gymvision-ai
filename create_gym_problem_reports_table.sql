-- Create problem reports table for user -> gym issue reporting
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.gym_problem_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    gym_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    gym_name TEXT NOT NULL,
    gym_place_id TEXT,
    exercise_key TEXT,
    exercise_display TEXT NOT NULL,
    issue_type TEXT NOT NULL,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    is_read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Helpful indexes for gym dashboard notifications
CREATE INDEX IF NOT EXISTS idx_gym_problem_reports_gym_id ON public.gym_problem_reports(gym_id);
CREATE INDEX IF NOT EXISTS idx_gym_problem_reports_gym_name ON public.gym_problem_reports(gym_name);
CREATE INDEX IF NOT EXISTS idx_gym_problem_reports_status_created ON public.gym_problem_reports(status, created_at DESC);

-- Optional constraints
ALTER TABLE public.gym_problem_reports
    DROP CONSTRAINT IF EXISTS gym_problem_reports_issue_type_check;
ALTER TABLE public.gym_problem_reports
    ADD CONSTRAINT gym_problem_reports_issue_type_check
    CHECK (issue_type IN ('Broken', 'Damaged', 'Not placed convenient', 'Very busy'));

ALTER TABLE public.gym_problem_reports
    DROP CONSTRAINT IF EXISTS gym_problem_reports_note_length_check;
ALTER TABLE public.gym_problem_reports
    ADD CONSTRAINT gym_problem_reports_note_length_check
    CHECK (note IS NULL OR char_length(note) <= 120);

ALTER TABLE public.gym_problem_reports
    DROP CONSTRAINT IF EXISTS gym_problem_reports_status_check;
ALTER TABLE public.gym_problem_reports
    ADD CONSTRAINT gym_problem_reports_status_check
    CHECK (status IN ('open', 'resolved'));

-- updated_at maintenance
CREATE OR REPLACE FUNCTION public.update_gym_problem_reports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS gym_problem_reports_set_updated_at ON public.gym_problem_reports;
CREATE TRIGGER gym_problem_reports_set_updated_at
    BEFORE UPDATE ON public.gym_problem_reports
    FOR EACH ROW
    EXECUTE FUNCTION public.update_gym_problem_reports_updated_at();

-- RLS
ALTER TABLE public.gym_problem_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert own problem reports" ON public.gym_problem_reports;
CREATE POLICY "Users can insert own problem reports"
    ON public.gym_problem_reports FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own problem reports" ON public.gym_problem_reports;
CREATE POLICY "Users can view own problem reports"
    ON public.gym_problem_reports FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Gym accounts can view own problem reports" ON public.gym_problem_reports;
CREATE POLICY "Gym accounts can view own problem reports"
    ON public.gym_problem_reports FOR SELECT
    USING (
        gym_id = auth.uid()
        OR gym_name IN (
            SELECT raw_user_meta_data->>'gym_name'
            FROM auth.users
            WHERE id = auth.uid()
              AND raw_user_meta_data->>'is_gym_account' = 'true'
        )
    );

DROP POLICY IF EXISTS "Service role full access to problem reports" ON public.gym_problem_reports;
CREATE POLICY "Service role full access to problem reports"
    ON public.gym_problem_reports FOR ALL
    USING (true)
    WITH CHECK (true);

GRANT ALL ON public.gym_problem_reports TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.gym_problem_reports TO authenticated;
