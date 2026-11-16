-- Create payroll_payments table for tracking payment status (paid, unpaid, partial)
CREATE TABLE IF NOT EXISTS payroll_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_user_id TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid', 'partial')),
  amount_paid NUMERIC(10, 2) DEFAULT 0,
  gross_pay NUMERIC(10, 2) DEFAULT 0,
  payment_method TEXT DEFAULT 'cash' CHECK (payment_method IN ('cash', 'bank_transfer', 'check', 'gcash')),
  paid_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(device_user_id, period_start, period_end)
);

ALTER TABLE payroll_payments ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'payroll_payments' AND policyname = 'allow_all_payroll_payments'
  ) THEN
    CREATE POLICY allow_all_payroll_payments ON payroll_payments FOR ALL USING (true);
  END IF;
END $$;
