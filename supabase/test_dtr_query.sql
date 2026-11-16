SELECT 
  full_name,
  work_date,
  to_char(first_check_in AT TIME ZONE 'Asia/Manila', 'HH12:MI AM') AS time_in,
  to_char(last_check_out AT TIME ZONE 'Asia/Manila', 'HH12:MI AM') AS time_out,
  total_punches,
  hours_worked,
  overtime_hours,
  shift_status
FROM public.daily_dtr
ORDER BY work_date DESC, full_name ASC
LIMIT 15;
