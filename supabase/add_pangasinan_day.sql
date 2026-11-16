-- Add Pangasinan Day (Nov 13) as a Regular Holiday (Double Pay / 200%) in payroll_settings
UPDATE payroll_settings
SET regular_holiday_dates = (
  SELECT jsonb_agg(DISTINCT elem)
  FROM jsonb_array_elements_text(regular_holiday_dates || '["2026-11-13"]'::jsonb) AS elem
),
updated_at = NOW()
WHERE fiscal_year = 2026;
