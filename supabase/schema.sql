-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- TABLE: employees
-- ============================================================
create table if not exists public.employees (
  id              uuid primary key default uuid_generate_v4(),
  device_user_id  text not null unique,
  full_name       text not null,
  branch          text not null default 'Dagupan Main',
  position        text,
  department      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.employees is 'Maps FingerTec device user IDs to employee profiles';
comment on column public.employees.device_user_id is 'User ID as stored on the TA500 device (e.g. 1, 2, 3)';

-- ============================================================
-- TABLE: attendance_logs
-- ============================================================
create table if not exists public.attendance_logs (
  id              uuid primary key default uuid_generate_v4(),
  device_user_id  text not null references public.employees(device_user_id) on delete restrict,
  punch_time      timestamptz not null,
  status          integer not null default 0,
  -- status codes: 0=check-in, 1=check-out, 2=break-out, 3=break-in, 4=OT-in, 5=OT-out
  raw_status      integer,
  synced_at       timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

comment on table public.attendance_logs is 'Raw punch logs synced from FingerTec TA500 biometric device';
comment on column public.attendance_logs.device_user_id is 'References employees.device_user_id';
comment on column public.attendance_logs.punch_time is 'Exact timestamp from the device clock';
comment on column public.attendance_logs.status is '0=check-in 1=check-out 2=break-out 3=break-in 4=OT-in 5=OT-out';

-- Unique constraint: prevent duplicate punches from re-syncs
create unique index if not exists attendance_logs_unique_punch
  on public.attendance_logs(device_user_id, punch_time);

-- Index for fast queries by employee and date
create index if not exists attendance_logs_device_user_id_idx
  on public.attendance_logs(device_user_id);

create index if not exists attendance_logs_punch_time_idx
  on public.attendance_logs(punch_time desc);

-- ============================================================
-- VIEW: daily_dtr
-- ============================================================
create or replace view public.daily_dtr as
select
  e.id               as employee_id,
  e.full_name,
  e.device_user_id,
  e.branch,
  date(a.punch_time at time zone 'Asia/Manila') as work_date,
  min(a.punch_time) filter (where a.status = 0) as first_check_in,
  max(a.punch_time) filter (where a.status = 1) as last_check_out,
  count(*)           as total_punches
from public.attendance_logs a
join public.employees e on e.device_user_id = a.device_user_id
group by e.id, e.full_name, e.device_user_id, e.branch, date(a.punch_time at time zone 'Asia/Manila');

-- ============================================================
-- RLS POLICIES (enable RLS then apply)
-- ============================================================
alter table public.employees enable row level security;
alter table public.attendance_logs enable row level security;

-- Allow service role full access (used by sync bridge)
create policy "Service role full access on employees"
  on public.employees for all
  using (true)
  with check (true);

create policy "Service role full access on attendance_logs"
  on public.attendance_logs for all
  using (true)
  with check (true);

-- ============================================================
-- FUNCTION: updated_at trigger
-- ============================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger employees_updated_at
  before update on public.employees
  for each row execute function public.set_updated_at();

-- ============================================================
-- SEED DATA (sample employees — adjust as needed)
-- ============================================================
insert into public.employees (device_user_id, full_name, branch, position)
values
  ('1', 'Gain Carlo',    'Dagupan Main', 'Administrator'),
  ('2', 'Sample Employee', 'Dagupan Main', 'Staff')
on conflict (device_user_id) do nothing;
