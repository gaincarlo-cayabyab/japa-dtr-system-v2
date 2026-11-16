-- ============================================================
-- TABLE: system_users
-- ============================================================
CREATE TABLE IF NOT EXISTS public.system_users (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username        TEXT NOT NULL UNIQUE,
  display_name    TEXT NOT NULL,
  pin_hash        TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'manager' CHECK (role IN ('super_admin', 'admin', 'manager', 'kiosk')),
  device_user_id  TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.system_users ENABLE ROW LEVEL SECURITY;

-- Service role has full access
CREATE POLICY "allow_all_system_users" ON public.system_users
  FOR ALL USING (true) WITH CHECK (true);

-- Seed initial 4 users
INSERT INTO public.system_users (username, display_name, pin_hash, role)
VALUES
  ('admin',        'IT Administrator', 'bfc26e834eb73af2ed202ac5882a549c6c71fe020f8eb702f3c5841f6256af14', 'super_admin'),
  ('japa_dee',     'JAPA Dee',         'f5c8d45dda87392ba948381012513734122b4f74af0dce7961eff6a79d9c0c6f', 'admin'),
  ('japa_pearly',  'JAPA Pearly',      '9dda58baef8e000e2b7e7500680bd9a95adceddc2677fe670c5934b535ff3561', 'admin'),
  ('japa_manager', 'JAPA Manager',     '6be1abf53f49e93c568a5b5e31cc6d10ef978a417d0f3ca954f134d71d8eca5f', 'manager')
ON CONFLICT (username) DO UPDATE
SET
  display_name = EXCLUDED.display_name,
  pin_hash = EXCLUDED.pin_hash,
  role = EXCLUDED.role;

