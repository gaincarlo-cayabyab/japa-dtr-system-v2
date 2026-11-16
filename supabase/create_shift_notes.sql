-- Create shift_notes table for Overtime reasons and administrator reconciliation notes
CREATE TABLE IF NOT EXISTS shift_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_user_id TEXT NOT NULL,
  work_date DATE NOT NULL,
  ot_reason TEXT NOT NULL DEFAULT '',
  created_by_username TEXT NOT NULL DEFAULT 'admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT shift_notes_user_date_unique UNIQUE (device_user_id, work_date)
);

-- Enable RLS
ALTER TABLE shift_notes ENABLE ROW LEVEL SECURITY;

-- Allow read access to all authenticated and anon users
DROP POLICY IF EXISTS "shift_notes_read_all" ON shift_notes;
CREATE POLICY "shift_notes_read_all" ON shift_notes FOR SELECT USING (true);

-- Allow insert/update to all
DROP POLICY IF EXISTS "shift_notes_write_all" ON shift_notes;
CREATE POLICY "shift_notes_write_all" ON shift_notes FOR ALL USING (true) WITH CHECK (true);
