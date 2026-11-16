-- Add attendance_status and notes to shift_notes for absent, leave, and sick leave tracking
ALTER TABLE shift_notes ADD COLUMN IF NOT EXISTS attendance_status TEXT DEFAULT 'present';
ALTER TABLE shift_notes ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';
