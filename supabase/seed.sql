-- ============================================================
-- SEED DATA: 5 Employees + Sample Attendance Logs
-- Run AFTER schema.sql
-- ============================================================

-- ============================================================
-- EMPLOYEES
-- ============================================================
insert into public.employees (device_user_id, full_name, branch, position, department)
values
  ('1', 'Gain Carlo',         'Dagupan Main', 'Administrator',     'IT'),
  ('2', 'Maria Santos',       'Dagupan Main', 'Cashier',           'Finance'),
  ('3', 'Juan dela Cruz',     'Dagupan Main', 'Sales Associate',   'Sales'),
  ('4', 'Ana Reyes',          'Dagupan Main', 'HR Officer',        'Human Resources'),
  ('5', 'Pedro Villanueva',   'Dagupan Main', 'Warehouse Staff',   'Operations')
on conflict (device_user_id) do nothing;

-- ============================================================
-- ATTENDANCE LOGS — Today (2026-11-13 PHT = UTC+8)
-- ============================================================

-- Gain Carlo (1): Full day
insert into public.attendance_logs (device_user_id, punch_time, status, raw_status)
values
  ('1', '2026-11-13 00:58:00+00', 0, 0),   -- 08:58 PHT check-in
  ('1', '2026-11-13 04:00:00+00', 2, 2),   -- 12:00 PHT break-out
  ('1', '2026-11-13 05:00:00+00', 3, 3),   -- 13:00 PHT break-in
  ('1', '2026-11-13 09:02:00+00', 1, 1)    -- 17:02 PHT check-out
on conflict do nothing;

-- Maria Santos (2): Full day
insert into public.attendance_logs (device_user_id, punch_time, status, raw_status)
values
  ('2', '2026-11-13 00:55:00+00', 0, 0),   -- 08:55 PHT check-in
  ('2', '2026-11-13 04:01:00+00', 2, 2),   -- 12:01 PHT break-out
  ('2', '2026-11-13 05:03:00+00', 3, 3),   -- 13:03 PHT break-in
  ('2', '2026-11-13 09:00:00+00', 1, 1)    -- 17:00 PHT check-out
on conflict do nothing;

-- Juan dela Cruz (3): Half day (no check-out yet)
insert into public.attendance_logs (device_user_id, punch_time, status, raw_status)
values
  ('3', '2026-11-13 01:03:00+00', 0, 0),   -- 09:03 PHT check-in
  ('3', '2026-11-13 04:05:00+00', 2, 2),   -- 12:05 PHT break-out
  ('3', '2026-11-13 05:00:00+00', 3, 3)    -- 13:00 PHT break-in
on conflict do nothing;

-- Ana Reyes (4): With overtime
insert into public.attendance_logs (device_user_id, punch_time, status, raw_status)
values
  ('4', '2026-11-13 00:50:00+00', 0, 0),   -- 08:50 PHT check-in
  ('4', '2026-11-13 04:00:00+00', 2, 2),   -- 12:00 PHT break-out
  ('4', '2026-11-13 04:58:00+00', 3, 3),   -- 12:58 PHT break-in
  ('4', '2026-11-13 09:00:00+00', 1, 1),   -- 17:00 PHT check-out
  ('4', '2026-11-13 09:05:00+00', 4, 4),   -- 17:05 PHT OT-in
  ('4', '2026-11-13 11:00:00+00', 5, 5)    -- 19:00 PHT OT-out
on conflict do nothing;

-- Pedro Villanueva (5): Yesterday (2026-11-12)
insert into public.attendance_logs (device_user_id, punch_time, status, raw_status)
values
  ('5', '2026-11-12 00:57:00+00', 0, 0),   -- 08:57 PHT check-in
  ('5', '2026-11-12 04:02:00+00', 2, 2),   -- 12:02 PHT break-out
  ('5', '2026-11-12 05:01:00+00', 3, 3),   -- 13:01 PHT break-in
  ('5', '2026-11-12 09:00:00+00', 1, 1)    -- 17:00 PHT check-out
on conflict do nothing;
