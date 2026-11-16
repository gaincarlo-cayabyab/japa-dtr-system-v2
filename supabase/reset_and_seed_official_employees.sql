-- ============================================================
-- JAPA DTR System: Reset & Seed Official Company Roster (24 Employees)
-- Based on official company payroll sheet & user specifications
-- ============================================================

-- 1. Add schedule_type and hourly_rate columns to employee_compensation if not exists
ALTER TABLE employee_compensation 
ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS schedule_type TEXT NOT NULL DEFAULT 'mon_sat' CHECK (schedule_type IN ('mon_sat', 'mon_fri'));

-- 2. Clear test attendance logs as requested
DELETE FROM attendance_logs;

-- 3. Clear existing compensation & employee records
DELETE FROM employee_compensation;
DELETE FROM employees;

-- 4. Seed all 24 official employees
INSERT INTO employees (device_user_id, full_name, branch, position, department) VALUES
('1',  'ARDIENTE, DENNIS P.',           'Dagupan Main', 'Staff', 'Operations'),
('2',  'BANIQUED, JEFFREY D.',          'Dagupan Main', 'Staff', 'Operations'),
('3',  'CAOILE, CARLO C.',              'Dagupan Main', 'Staff', 'Operations'),
('4',  'DE VERA, PEARLY B.',            'Dagupan Main', 'Staff', 'Operations'),
('5',  'DE VERA, IVAN',                 'Dagupan Main', 'Staff', 'Operations'),
('6',  'DEE, JERWIN B.',                'Dagupan Main', 'Staff', 'Operations'),
('7',  'ESTACIO, LYCA',                 'Dagupan Main', 'Staff', 'Operations'),
('8',  'ESTACIO, LARRY L.',             'Dagupan Main', 'Staff', 'Operations'),
('9',  'GALVAN, JANINE KYLE',           'Dagupan Main', 'Staff', 'Operations'),
('10', 'GALVAN, JOANNE KRYSHELLE C.',   'Dagupan Main', 'Staff', 'Operations'),
('11', 'SORIANO, JAMAICA',              'Dagupan Main', 'Staff', 'Operations'),
('12', 'PARAGAS, CHRISTIAN MICAH G.',   'Dagupan Main', 'Staff', 'Operations'),
('13', 'ROMERO, ROWENA',                'Dagupan Main', 'Staff', 'Operations'),
('14', 'GALZOTE, RANDOLF J.',           'Dagupan Main', 'Staff', 'Operations'),
('15', 'LUNA, JUVELL',                  'Dagupan Main', 'Staff', 'Operations'),
('16', 'TIOZON, HENRY M.',              'Dagupan Main', 'Staff', 'Operations'),
('17', 'TIU, MELANIE P.',               'Dagupan Main', 'Staff', 'Operations'),
('18', 'LUNA, ROBERT',                  'Dagupan Main', 'Staff', 'Operations'),
('19', 'SENTENILLAR, ASKY',             'Dagupan Main', 'Staff', 'Operations'),
('20', 'COSTALES, BARBARA ELLAINE S.',  'Dagupan Main', 'Staff', 'Operations'),
('21', 'COSTALES, MARIE STEFI S.',      'Dagupan Main', 'Staff', 'Operations'),
('22', 'JOCELYN LUTERIA',               'Dagupan Main', 'Staff', 'Operations'),
('23', 'HARIM LAGAO',                   'Dagupan Main', 'Staff', 'Operations'),
('24', 'CAYABYAB, GAIN CARLO',          'Dagupan Main', 'Administrator / IT', 'Management');

-- 5. Seed exact compensation rates from official sheet
-- Mon-Sat is standard (Sunday rest day).
-- Gain Carlo Cayabyab is Mon-Fri (Saturday & Sunday rest day).
INSERT INTO employee_compensation (device_user_id, daily_rate, hourly_rate, schedule_type, employment_type, overtime_eligible, night_diff_eligible) VALUES
('1',  400.00,  50.00,  'mon_sat', 'regular', true, true),
('2',  500.00,  62.50,  'mon_sat', 'regular', true, true),
('3',  420.00,  52.50,  'mon_sat', 'regular', true, true),
('4',  520.00,  65.00,  'mon_sat', 'regular', true, true),
('5',  520.00,  65.00,  'mon_sat', 'regular', true, true),
('6',  961.54,  120.19, 'mon_sat', 'regular', true, true),
('7',  400.00,  50.00,  'mon_sat', 'regular', true, true),
('8',  500.00,  62.50,  'mon_sat', 'regular', true, true),
('9',  500.00,  62.50,  'mon_sat', 'regular', true, true),
('10', 1153.85, 144.23, 'mon_sat', 'regular', true, true),
('11', 400.00,  50.00,  'mon_sat', 'regular', true, true),
('12', 520.00,  65.00,  'mon_sat', 'regular', true, true),
('13', 450.00,  56.25,  'mon_sat', 'regular', true, true),
('14', 450.00,  56.25,  'mon_sat', 'regular', true, true),
('15', 400.00,  50.00,  'mon_sat', 'regular', true, true),
('16', 550.00,  68.75,  'mon_sat', 'regular', true, true),
('17', 520.00,  65.00,  'mon_sat', 'regular', true, true),
('18', 400.00,  50.00,  'mon_sat', 'regular', true, true),
('19', 450.00,  56.25,  'mon_sat', 'regular', true, true),
('20', 400.00,  50.00,  'mon_sat', 'regular', true, true),
('21', 400.00,  50.00,  'mon_sat', 'regular', true, true),
('22', 500.00,  62.50,  'mon_sat', 'regular', true, true),
('23', 550.00,  68.75,  'mon_sat', 'regular', true, true),
('24', 550.00,  68.75,  'mon_fri', 'regular', true, true);

-- 6. Update sync_meta to tell tablet bridge to clear local cache
UPDATE sync_meta SET value = 1 WHERE key = 'clear_hardware';
UPDATE sync_meta SET value = COALESCE(value, 0) + 1 WHERE key = 'clear_token';
