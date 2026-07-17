begin;

create table if not exists public.user_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  device_name text not null default 'Unknown device',
  platform text not null default 'web',
  device_fingerprint text,
  push_token text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.user_devices
  add column if not exists device_fingerprint text;

create table if not exists public.user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  device_id uuid references public.user_devices(id) on delete set null,
  client_session_id text,
  ip_hash text,
  user_agent text,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

alter table public.user_sessions
  add column if not exists client_session_id text;

create unique index if not exists idx_user_devices_fingerprint
  on public.user_devices(user_id, device_fingerprint);
create index if not exists idx_user_devices_user
  on public.user_devices(user_id, last_seen_at desc);
create unique index if not exists idx_user_sessions_client_id
  on public.user_sessions(user_id, client_session_id);
create index if not exists idx_user_sessions_user
  on public.user_sessions(user_id, last_seen_at desc);

alter table public.user_devices enable row level security;
alter table public.user_sessions enable row level security;

drop policy if exists "devices_own" on public.user_devices;
create policy "devices_own" on public.user_devices
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "sessions_own" on public.user_sessions;
create policy "sessions_own" on public.user_sessions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on public.user_devices from anon;
revoke all on public.user_sessions from anon;
grant select, insert, update, delete on public.user_devices to authenticated;
grant select, insert, update, delete on public.user_sessions to authenticated;

create or replace function public.get_my_blocked_users()
returns table(id uuid, blocked_id uuid, display_name text, avatar_url text, created_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select b.id, b.blocked_id, p.display_name, p.avatar_url, b.created_at
  from public.blocked_users b
  join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = auth.uid()
  order by b.created_at desc;
$$;

revoke all on function public.get_my_blocked_users() from public;
grant execute on function public.get_my_blocked_users() to authenticated;

commit;
