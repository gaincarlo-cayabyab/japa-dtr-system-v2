-- Seed attendance punches for Gain Carlo Cayabyab (device_user_id = '24')
-- Period: November 1 to 16, 2026
-- Schedule: Monday to Friday, 9:00 AM to 6:00 PM (Saturdays & Sundays are rest days)

INSERT INTO attendance_logs (device_user_id, punch_time, status, synced_at) VALUES
-- Nov 2 (Mon)
('24', '2026-11-02T09:00:00+08:00', 0, timezone('utc', now())),
('24', '2026-11-02T18:00:00+08:00', 1, timezone('utc', now())),

-- Nov 3 (Tue)
('24', '2026-11-03T09:00:00+08:00', 0, timezone('utc', now())),
('24', '2026-11-03T18:00:00+08:00', 1, timezone('utc', now())),

-- Nov 4 (Wed)
('24', '2026-11-04T09:00:00+08:00', 0, timezone('utc', now())),
('24', '2026-11-04T18:00:00+08:00', 1, timezone('utc', now())),

-- Nov 5 (Thu)
('24', '2026-11-05T09:00:00+08:00', 0, timezone('utc', now())),
('24', '2026-11-05T18:00:00+08:00', 1, timezone('utc', now())),

-- Nov 6 (Fri)
('24', '2026-11-06T09:00:00+08:00', 0, timezone('utc', now())),
('24', '2026-11-06T18:00:00+08:00', 1, timezone('utc', now())),

-- Nov 9 (Mon)
('24', '2026-11-09T09:00:00+08:00', 0, timezone('utc', now())),
('24', '2026-11-09T18:00:00+08:00', 1, timezone('utc', now())),

-- Nov 10 (Tue)
('24', '2026-11-10T09:00:00+08:00', 0, timezone('utc', now())),
('24', '2026-11-10T18:00:00+08:00', 1, timezone('utc', now())),

-- Nov 11 (Wed)
('24', '2026-11-11T09:00:00+08:00', 0, timezone('utc', now())),
('24', '2026-11-11T18:00:00+08:00', 1, timezone('utc', now())),

-- Nov 12 (Thu)
('24', '2026-11-12T09:00:00+08:00', 0, timezone('utc', now())),
('24', '2026-11-12T18:00:00+08:00', 1, timezone('utc', now())),

-- Nov 13 (Fri)
('24', '2026-11-13T09:00:00+08:00', 0, timezone('utc', now())),
('24', '2026-11-13T18:00:00+08:00', 1, timezone('utc', now())),

-- Nov 16 (Mon)
('24', '2026-11-16T09:00:00+08:00', 0, timezone('utc', now())),
('24', '2026-11-16T18:00:00+08:00', 1, timezone('utc', now()));
