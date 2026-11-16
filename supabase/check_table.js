const { createClient } = require('@supabase/supabase-js');
const sb = createClient(
  'https://blmthmojjnonbmwitzmc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJsbXRobW9qam5vbmJtd2l0em1jIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5NDUzOTI3MCwiZXhwIjoyMTEwMTE1MjcwfQ.hsO_inZ9Faei67c5edyo4iGk9E96hMO5VYhiMKi9m6o'
);

async function main() {
  const sql = `
    CREATE TABLE IF NOT EXISTS payroll_payments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      device_user_id TEXT NOT NULL,
      period_start DATE NOT NULL,
      period_end DATE NOT NULL,
      payment_status TEXT NOT NULL DEFAULT 'unpaid',
      amount_paid NUMERIC(10, 2) DEFAULT 0,
      gross_pay NUMERIC(10, 2) DEFAULT 0,
      payment_method TEXT DEFAULT 'cash',
      paid_at TIMESTAMPTZ,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(device_user_id, period_start, period_end)
    );
  `;
  
  // Use supabase sql execution via postgres rpc or postgres connection
  // Check if we can insert or query
  const res = await sb.from('payroll_payments').select('id').limit(1);
  if (res.error && res.error.message.includes('relation "public.payroll_payments" does not exist')) {
    console.log('Table does not exist yet. Creating via sql endpoint...');
  } else if (!res.error) {
    console.log('Table payroll_payments already exists!');
    return;
  }
}
main();
