begin;

alter table public.user_sessions add column if not exists client_session_id text;
drop index if exists public.idx_user_sessions_client_id;
create unique index idx_user_sessions_client_id
  on public.user_sessions(user_id, client_session_id);

-- A user can read the public identity of people they blocked without granting
-- access to unrelated private profile fields through the Settings UI.
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
