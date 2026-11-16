-- ============================================================
-- JAPA DTR SYSTEM: Roster & Holiday & Shifts Update
-- 1. Delete PARAGAS, CHRISTIAN MICAH G. (ID #12)
-- 2. Update Branch to 'Manila' for Barbara Costales, Marie Stefi Costales, Jocelyn Luteria
-- 3. Update Gain Carlo Cayabyab to 'CAYABYAB, GAIN CARLO G.'
-- 4. Correct Nov 13: Move from regular to special non-working (Speaker Eugenio Perez Day)
-- 5. Update daily_dtr view to clamp morning arrival to 9:00 AM (no early-arrival false OT)
-- 6. Insert Barbara (12 days) and Stef (5 days) attendance punches from timesheets
-- ============================================================

-- 1. Delete PARAGAS, CHRISTIAN MICAH G.
DELETE FROM public.attendance_logs WHERE device_user_id = '12';
DELETE FROM public.employee_compensation WHERE device_user_id = '12';
DELETE FROM public.payroll_payments WHERE device_user_id = '12';
DELETE FROM public.shift_notes WHERE device_user_id = '12';
DELETE FROM public.employees WHERE device_user_id = '12';

-- 2. Update Branch to 'Manila'
UPDATE public.employees
SET branch = 'Manila', updated_at = now()
WHERE device_user_id IN ('20', '21', '22');

-- 3. Update Gain Carlo's name
UPDATE public.employees
SET full_name = 'CAYABYAB, GAIN CARLO G.', updated_at = now()
WHERE device_user_id = '24';

-- 4. Correct Nov 13 in payroll_settings (Speaker Eugenio Perez Day = Special Non-Working Holiday)
UPDATE public.payroll_settings
SET 
  regular_holiday_dates = (
    SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
    FROM jsonb_array_elements_text(regular_holiday_dates) AS elem
    WHERE elem <> '2026-11-13'
  ),
  special_holiday_dates = (
    CASE 
      WHEN special_holiday_dates @> '["2026-11-13"]'::jsonb THEN special_holiday_dates
      ELSE special_holiday_dates || '["2026-11-13"]'::jsonb
    END
  ),
  updated_at = now()
WHERE fiscal_year = 2026;

-- 5. Upgrade daily_dtr view (Clamp early arrival to 9:00 AM + Lunch Break 12-1pm deduction)
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
    -- Official work start is 9:00 AM. Arriving early (e.g. 8:17, 8:25, 8:31 AM) is early arrival, not OT.
    GREATEST(first_check_in AT TIME ZONE 'Asia/Manila', (work_date::text || ' 09:00:00')::timestamp) AS effective_in,
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
  -- Calculate net decimal hours worked (deducting 12:00 PM to 1:00 PM unpaid lunch break from effective start)
  CASE 
    WHEN last_check_out IS NOT NULL THEN 
      ROUND(
        GREATEST(
          0.00,
          (EXTRACT(EPOCH FROM (out_local - effective_in)) / 3600.0) -
          CASE
            WHEN out_local > lunch_start AND effective_in < lunch_end THEN
              GREATEST(0.00, EXTRACT(EPOCH FROM (LEAST(out_local, lunch_end) - GREATEST(effective_in, lunch_start))) / 3600.0)
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
            (EXTRACT(EPOCH FROM (out_local - effective_in)) / 3600.0) -
            CASE
              WHEN out_local > lunch_start AND effective_in < lunch_end THEN
                GREATEST(0.00, EXTRACT(EPOCH FROM (LEAST(out_local, lunch_end) - GREATEST(effective_in, lunch_start))) / 3600.0)
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
    WHEN last_check_out IS NOT NULL THEN 'Completed'::text
    WHEN first_check_in IS NOT NULL AND work_date = (now() AT TIME ZONE 'Asia/Manila')::date THEN 'On Duty'::text
    ELSE 'Incomplete'::text
  END AS shift_status
FROM shift_calc;

-- 6. Insert attendance punches for Barbara (12 days) and Stef (5 days)
DELETE FROM public.attendance_logs WHERE device_user_id IN ('20', '21');

-- BARBARA ELLAINE S. COSTALES (ID #20) - 12 days worked
INSERT INTO public.attendance_logs (device_user_id, punch_time, status, synced_at) VALUES
-- Nov 2 (Mon) - 8:31 AM to 6:00 PM
('20', '2026-11-02T08:31:00+08:00', 0, timezone('utc', now())),
('20', '2026-11-02T18:00:00+08:00', 1, timezone('utc', now())),

-- Nov 3 (Tue) - 8:34 AM to 6:00 PM
('20', '2026-11-03T08:34:00+08:00', 0, timezone('utc', now())),
('20', '2026-11-03T18:00:00+08:00', 1, timezone('utc', now())),

-- Nov 4 (Wed) - 8:47 AM to 6:00 PM
('20', '2026-11-04T08:47:00+08:00', 0, timezone('utc', now())),
('20', '2026-11-04T18:00:00+08:00', 1, timezone('utc', now())),

-- Nov 5 (Thu) - 8:30 AM to 6:00 PM
('20', '2026-11-05T08:30:00+08:00', 0, timezone('utc', now())),
('20', '2026-11-05T18:00:00+08:00', 1, timezone('utc', now())),

-- Nov 6 (Fri) - 10:47 AM to 6:00 PM (Late arrival)
('20', '2026-11-06T10:47:00+08:00', 0, timezone('utc', now())),
('20', '2026-11-06T18:00:00+08:00', 1, timezone('utc', now())),

-- Nov 7 (Sat) - 8:33 AM to 6:00 PM
('20', '2026-11-07T08:33:00+08:00', 0, timezone('utc', now())),
('20', '2026-11-07T18:00:00+08:00', 1, timezone('utc', now())),

-- Nov 9 (Mon) - 8:33 AM to 6:00 PM
('20', '2026-11-09T08:33:00+08:00', 0, timezone('utc', now())),
('20', '2026-11-09T18:00:00+08:00', 1, timezone('utc', now())),

-- Nov 10 (Tue) - 8:30 AM to 6:00 PM
('20', '2026-11-10T08:30:00+08:00', 0, timezone('utc', now())),
('20', '2026-11-10T18:00:00+08:00', 1, timezone('utc', now())),

-- Nov 11 (Wed) - 8:29 AM to 6:00 PM
('20', '2026-11-11T08:29:00+08:00', 0, timezone('utc', now())),
('20', '2026-11-11T18:00:00+08:00', 1, timezone('utc', now())),

-- Nov 12 (Thu) - 8:29 AM to 6:00 PM
('20', '2026-11-12T08:29:00+08:00', 0, timezone('utc', now())),
('20', '2026-11-12T18:00:00+08:00', 1, timezone('utc', now())),

-- Nov 13 (Fri) - 8:25 AM to 6:00 PM (Speaker Eugenio Perez Day)
('20', '2026-11-13T08:25:00+08:00', 0, timezone('utc', now())),
('20', '2026-11-13T18:00:00+08:00', 1, timezone('utc', now())),

-- Nov 14 (Sat) - 8:31 AM to 6:00 PM
('20', '2026-11-14T08:31:00+08:00', 0, timezone('utc', now())),
('20', '2026-11-14T18:00:00+08:00', 1, timezone('utc', now()));

-- MARIE STEFI S. COSTALES (ID #21) - 5 days worked
INSERT INTO public.attendance_logs (device_user_id, punch_time, status, synced_at) VALUES
-- Nov 2 (Mon) - 8:28 AM to 6:00 PM
('21', '2026-11-02T08:28:00+08:00', 0, timezone('utc', now())),
('21', '2026-11-02T18:00:00+08:00', 1, timezone('utc', now())),

-- Nov 3 (Tue) - 8:27 AM to 6:00 PM
('21', '2026-11-03T08:27:00+08:00', 0, timezone('utc', now())),
('21', '2026-11-03T18:00:00+08:00', 1, timezone('utc', now())),

-- Nov 4 (Wed) - 8:17 AM to 6:00 PM
('21', '2026-11-04T08:17:00+08:00', 0, timezone('utc', now())),
('21', '2026-11-04T18:00:00+08:00', 1, timezone('utc', now())),

-- Nov 5 (Thu) - 8:30 AM to 6:00 PM
('21', '2026-11-05T08:30:00+08:00', 0, timezone('utc', now())),
('21', '2026-11-05T18:00:00+08:00', 1, timezone('utc', now())),

-- Nov 6 (Fri) - 8:30 AM to 6:00 PM
('21', '2026-11-06T08:30:00+08:00', 0, timezone('utc', now())),
('21', '2026-11-06T18:00:00+08:00', 1, timezone('utc', now()));
