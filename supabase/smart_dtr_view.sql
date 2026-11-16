-- ============================================================
-- VIEW: daily_dtr (Upgraded with 4:00 AM Operational Cutoff & Smart Pairing)
-- ============================================================

DROP VIEW IF EXISTS public.daily_dtr CASCADE;

CREATE OR REPLACE VIEW public.daily_dtr AS
WITH operational_punches AS (
  SELECT
    a.id,
    a.device_user_id,
    e.id AS employee_id,
    e.full_name,
    e.branch,
    a.punch_time,
    -- 4:00 AM Cutoff: Any punch before 4:00 AM is attributed to previous workday
    ((a.punch_time AT TIME ZONE 'Asia/Manila') - INTERVAL '4 hours')::date AS work_date
  FROM public.attendance_logs a
  JOIN public.employees e ON e.device_user_id = a.device_user_id
),
shift_summary AS (
  SELECT
    employee_id,
    device_user_id,
    full_name,
    branch,
    work_date,
    min(punch_time) AS first_check_in,
    -- Time Out: Last punch of the operational day, provided it is at least 3 minutes after Time In
    CASE 
      WHEN max(punch_time) > min(punch_time) + INTERVAL '3 minutes' THEN max(punch_time)
      ELSE NULL
    END AS last_check_out,
    count(*) AS total_punches
  FROM operational_punches
  GROUP BY employee_id, device_user_id, full_name, branch, work_date
)
SELECT 
  employee_id,
  full_name,
  device_user_id,
  branch,
  work_date::text AS work_date,
  first_check_in,
  last_check_out,
  total_punches,
  -- Calculate decimal hours worked (e.g. 8.5)
  CASE 
    WHEN last_check_out IS NOT NULL THEN 
      ROUND(EXTRACT(EPOCH FROM (last_check_out - first_check_in)) / 3600.0, 2)
    ELSE 0.00
  END AS hours_worked,
  -- Overtime: Any hours beyond 8.0 regular working hours
  CASE 
    WHEN last_check_out IS NOT NULL AND EXTRACT(EPOCH FROM (last_check_out - first_check_in)) / 3600.0 > 8.0 THEN
      ROUND((EXTRACT(EPOCH FROM (last_check_out - first_check_in)) / 3600.0) - 8.0, 2)
    ELSE 0.00
  END AS overtime_hours,
  -- Shift status
  CASE
    WHEN last_check_out IS NOT NULL THEN 'Completed'
    WHEN work_date = ((now() AT TIME ZONE 'Asia/Manila') - INTERVAL '4 hours')::date THEN 'On Duty'
    ELSE 'Incomplete'
  END AS shift_status
FROM shift_summary;

-- Allow public / anon / authenticated full read access on view
GRANT SELECT ON public.daily_dtr TO anon, authenticated, service_role;
