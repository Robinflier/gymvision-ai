-- Peak times aggregation RPC for gym dashboard
-- Run this in Supabase SQL editor (production project).

BEGIN;

CREATE OR REPLACE FUNCTION public.get_gym_peak_times(
	p_user_ids uuid[],
	p_gym_name text,
	p_start_date date DEFAULT NULL,
	p_end_date date DEFAULT NULL
)
RETURNS TABLE (
	weekday_name text,
	hour integer,
	workout_count bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
	SELECT
		CASE EXTRACT(ISODOW FROM w.date::date)
			WHEN 1 THEN 'Monday'
			WHEN 2 THEN 'Tuesday'
			WHEN 3 THEN 'Wednesday'
			WHEN 4 THEN 'Thursday'
			WHEN 5 THEN 'Friday'
			WHEN 6 THEN 'Saturday'
			WHEN 7 THEN 'Sunday'
		END AS weekday_name,
		EXTRACT(
			HOUR FROM timezone(
				'Europe/Amsterdam',
				COALESCE(
					w.inserted_at,
					w.created_at,
					(w.date::timestamp + interval '12 hour')
				)
			)
		)::int AS hour,
		COUNT(*)::bigint AS workout_count
	FROM public.workouts w
	WHERE
		w.user_id = ANY(p_user_ids)
		AND (p_start_date IS NULL OR w.date >= p_start_date)
		AND (p_end_date IS NULL OR w.date <= p_end_date)
		AND lower(trim(COALESCE(w.gym_name, ''))) = lower(trim(COALESCE(p_gym_name, '')))
		AND lower(trim(COALESCE(w.gym_name, ''))) NOT IN ('', '-', 'gym -')
	GROUP BY 1, 2, EXTRACT(ISODOW FROM w.date::date)
	ORDER BY EXTRACT(ISODOW FROM w.date::date), hour;
$$;

GRANT EXECUTE ON FUNCTION public.get_gym_peak_times(uuid[], text, date, date) TO anon, authenticated, service_role;

COMMIT;
