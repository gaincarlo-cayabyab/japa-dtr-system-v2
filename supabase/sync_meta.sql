-- Create sync_meta table for coordination between bridge and web UI
CREATE TABLE IF NOT EXISTS public.sync_meta (
  key   TEXT PRIMARY KEY,
  value INTEGER NOT NULL DEFAULT 0
);

-- Seed the clear_token row
INSERT INTO public.sync_meta (key, value)
VALUES ('clear_token', 0)
ON CONFLICT (key) DO NOTHING;

-- Function to atomically increment the clear_token
CREATE OR REPLACE FUNCTION public.increment_clear_token()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.sync_meta (key, value)
  VALUES ('clear_token', 1)
  ON CONFLICT (key)
  DO UPDATE SET value = sync_meta.value + 1;
END;
$$;

-- Allow anon + service role to read/write sync_meta
ALTER TABLE public.sync_meta ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_sync_meta" ON public.sync_meta
  FOR ALL USING (true) WITH CHECK (true);

