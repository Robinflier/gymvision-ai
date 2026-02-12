-- Top machines aggregation RPC for gym dashboard
-- Run this in Supabase SQL editor (production project).

BEGIN;

CREATE OR REPLACE FUNCTION public.get_gym_top_machines(
	p_user_ids uuid[],
	p_gym_name text,
	p_start_date date DEFAULT NULL,
	p_end_date date DEFAULT NULL
)
RETURNS TABLE (
	label text,
	value bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
	WITH filtered_workouts AS (
		SELECT w.exercises
		FROM public.workouts w
		WHERE
			w.user_id = ANY(p_user_ids)
			AND (p_start_date IS NULL OR w.date >= p_start_date)
			AND (p_end_date IS NULL OR w.date <= p_end_date)
			AND lower(trim(COALESCE(w.gym_name, ''))) = lower(trim(COALESCE(p_gym_name, '')))
			AND lower(trim(COALESCE(w.gym_name, ''))) NOT IN ('', '-', 'gym -')
	),
	exercise_rows AS (
		SELECT
			COALESCE(NULLIF(trim(ex->>'display'), ''), NULLIF(trim(ex->>'key'), ''), 'Exercise') AS machine_label,
			(
				SELECT COUNT(*)
				FROM jsonb_array_elements(COALESCE(ex->'sets', '[]'::jsonb)) AS s
				WHERE
					COALESCE(NULLIF(trim(s->>'weight'), ''), NULLIF(trim(s->>'reps'), ''), NULLIF(trim(s->>'min'), ''), NULLIF(trim(s->>'sec'), ''), NULLIF(trim(s->>'km'), ''), NULLIF(trim(s->>'cal'), '')) IS NOT NULL
			)::bigint AS set_count
		FROM filtered_workouts fw
		CROSS JOIN LATERAL jsonb_array_elements(COALESCE(fw.exercises, '[]'::jsonb)) AS ex
	)
	SELECT machine_label AS label, SUM(set_count)::bigint AS value
	FROM exercise_rows
	WHERE set_count > 0
	GROUP BY machine_label
	ORDER BY value DESC, label ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_gym_top_machines(uuid[], text, date, date) TO anon, authenticated, service_role;

COMMIT;
