-- Seed default compensation for existing employees if not present
INSERT INTO employee_compensation (device_user_id, daily_rate, employment_type, overtime_eligible, night_diff_eligible)
SELECT 
  device_user_id, 
  610.00 as daily_rate, 
  'regular' as employment_type, 
  true as overtime_eligible, 
  true as night_diff_eligible
FROM employees
ON CONFLICT (device_user_id) DO NOTHING;
