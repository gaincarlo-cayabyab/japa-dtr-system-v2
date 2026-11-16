-- ============================================================
-- JAPA DTR System: Phase 3 Payroll Engine Schema
-- Apply via Supabase SQL Editor
-- ============================================================

-- 1. Employee Compensation Table
CREATE TABLE IF NOT EXISTS employee_compensation (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_user_id  TEXT NOT NULL REFERENCES employees(device_user_id) ON DELETE CASCADE,
  daily_rate      NUMERIC(10,2) NOT NULL DEFAULT 0,
  monthly_rate    NUMERIC(10,2),
  employment_type TEXT NOT NULL DEFAULT 'regular' CHECK (employment_type IN ('regular','probationary','contractual')),
  overtime_eligible    BOOLEAN NOT NULL DEFAULT true,
  night_diff_eligible  BOOLEAN NOT NULL DEFAULT true,
  effectivity_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(device_user_id)
);

-- 2. Payroll Settings (singleton row per year)
CREATE TABLE IF NOT EXISTS payroll_settings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_year     INT NOT NULL DEFAULT 2026,
  work_hours_per_day     INT NOT NULL DEFAULT 8,
  grace_period_minutes   INT NOT NULL DEFAULT 5,
  night_diff_start       TIME NOT NULL DEFAULT '22:00:00',
  night_diff_end         TIME NOT NULL DEFAULT '06:00:00',
  regular_holiday_dates  JSONB NOT NULL DEFAULT '[]',
  special_holiday_dates  JSONB NOT NULL DEFAULT '[]',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(fiscal_year)
);

-- 3. Seed default 2026 Philippine holidays
INSERT INTO payroll_settings (fiscal_year, regular_holiday_dates, special_holiday_dates)
VALUES (
  2026,
  -- Regular holidays (200% pay)
  '[
    "2026-01-01",
    "2026-04-02",
    "2026-04-03",
    "2026-04-09",
    "2026-05-01",
    "2026-06-12",
    "2026-08-31",
    "2026-11-30",
    "2026-12-25",
    "2026-12-30",
    "2026-12-31"
  ]'::jsonb,
  -- Special non-working holidays (130% pay if worked)
  '[
    "2026-01-02",
    "2026-02-05",
    "2026-02-25",
    "2026-04-04",
    "2026-08-21",
    "2026-10-31",
    "2026-11-01",
    "2026-11-02",
    "2026-12-08",
    "2026-12-24"
  ]'::jsonb
)
ON CONFLICT (fiscal_year) DO NOTHING;

-- 4. Payroll Periods Table (for tracking computed payroll)
CREATE TABLE IF NOT EXISTS payroll_periods (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_label    TEXT NOT NULL,
  period_start    DATE NOT NULL,
  period_end      DATE NOT NULL,
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','finalized')),
  computed_at     TIMESTAMPTZ,
  created_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS but allow service role full access
ALTER TABLE employee_compensation ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_periods ENABLE ROW LEVEL SECURITY;

-- Allow all for service role (used by API)
CREATE POLICY "service_role_all" ON employee_compensation FOR ALL USING (true);
CREATE POLICY "service_role_all" ON payroll_settings FOR ALL USING (true);
CREATE POLICY "service_role_all" ON payroll_periods FOR ALL USING (true);
