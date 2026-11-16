-- ============================================================
-- VIEW: daily_dtr (Upgraded with 12:00 PM - 1:00 PM Lunch Break Deduction & 4:00 AM Operational Cutoff)
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
),
shift_calc AS (
  SELECT
    employee_id,
    device_user_id,
    full_name,
    branch,
    work_date,
    first_check_in,
    last_check_out,
    total_punches,
    first_check_in AT TIME ZONE 'Asia/Manila' AS in_local,
    last_check_out AT TIME ZONE 'Asia/Manila' AS out_local,
    (work_date::text || ' 12:00:00')::timestamp AS lunch_start,
    (work_date::text || ' 13:00:00')::timestamp AS lunch_end
  FROM shift_summary
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
  -- Calculate net decimal hours worked (deducting 12:00 PM to 1:00 PM unpaid lunch break)
  CASE 
    WHEN last_check_out IS NOT NULL THEN 
      ROUND(
        GREATEST(
          0.00,
          (EXTRACT(EPOCH FROM (out_local - in_local)) / 3600.0) -
          CASE
            WHEN out_local > lunch_start AND in_local < lunch_end THEN
              GREATEST(0.00, EXTRACT(EPOCH FROM (LEAST(out_local, lunch_end) - GREATEST(in_local, lunch_start))) / 3600.0)
            ELSE 0.00
          END
        )::numeric,
        2
      )
    ELSE 0.00
  END AS hours_worked,
  -- Overtime: Any hours beyond 8.0 regular net working hours
  CASE 
    WHEN last_check_out IS NOT NULL THEN
      GREATEST(
        0.00,
        ROUND(
          (
            (EXTRACT(EPOCH FROM (out_local - in_local)) / 3600.0) -
            CASE
              WHEN out_local > lunch_start AND in_local < lunch_end THEN
                GREATEST(0.00, EXTRACT(EPOCH FROM (LEAST(out_local, lunch_end) - GREATEST(in_local, lunch_start))) / 3600.0)
              ELSE 0.00
            END - 8.00
          )::numeric,
          2
        )
      )
    ELSE 0.00
  END AS overtime_hours,
  -- Shift status
  CASE
    WHEN last_check_out IS NOT NULL THEN 'Completed'
    WHEN work_date = ((now() AT TIME ZONE 'Asia/Manila') - INTERVAL '4 hours')::date THEN 'On Duty'
    ELSE 'Incomplete'
  END AS shift_status
FROM shift_calc;

-- Allow public / anon / authenticated full read access on view
GRANT SELECT ON public.daily_dtr TO anon, authenticated, service_role;
