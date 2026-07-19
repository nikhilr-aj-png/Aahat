begin;

create extension if not exists pgcrypto;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'super_admin'
  );
$$;

revoke all on function public.is_super_admin() from public;
grant execute on function public.is_super_admin() to authenticated;

alter table public.profiles
  add column if not exists account_status text not null default 'active';

do $$
begin
  alter table public.profiles
    add constraint profiles_account_status_check
    check (account_status in ('active', 'suspended', 'banned'));
exception when duplicate_object then null;
end $$;

create index if not exists idx_profiles_account_status
  on public.profiles(account_status);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_user_id uuid references public.profiles(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  message_id uuid references public.messages(id) on delete set null,
  channel_id uuid references public.channels(id) on delete set null,
  reason text not null,
  details text default '',
  status text default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  assigned_admin_id uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.profiles(id) on delete cascade,
  target_user_id uuid references public.profiles(id) on delete set null,
  report_id uuid references public.reports(id) on delete set null,
  action_type text not null check (action_type in (
    'warn', 'ban', 'unban', 'suspend', 'reactivate', 'delete_message',
    'review_report', 'dismiss_report', 'resolve_report'
  )),
  reason text default '',
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Older deployments used a narrower action check. Replace it additively.
do $$
declare
  constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'public.moderation_actions'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%action_type%'
  limit 1;

  if constraint_name is not null then
    execute format('alter table public.moderation_actions drop constraint %I', constraint_name);
  end if;

  alter table public.moderation_actions
    add constraint moderation_actions_action_type_check
    check (action_type in (
      'warn', 'ban', 'unban', 'suspend', 'reactivate', 'delete_message',
      'review_report', 'dismiss_report', 'resolve_report'
    ));
exception when duplicate_object then null;
end $$;

create index if not exists idx_reports_status_created
  on public.reports(status, created_at desc);
create index if not exists idx_moderation_actions_created
  on public.moderation_actions(created_at desc);

alter table public.reports enable row level security;
alter table public.moderation_actions enable row level security;

drop policy if exists reports_insert_own on public.reports;
create policy reports_insert_own on public.reports
  for insert to authenticated
  with check (reporter_id = auth.uid());

drop policy if exists reports_select_own_or_admin on public.reports;
create policy reports_select_own_or_admin on public.reports
  for select to authenticated
  using (reporter_id = auth.uid() or public.is_super_admin());

drop policy if exists reports_update_admin on public.reports;
create policy reports_update_admin on public.reports
  for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists moderation_actions_admin on public.moderation_actions;
create policy moderation_actions_admin on public.moderation_actions
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

create or replace function public.admin_dashboard_overview()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.is_super_admin() then
    raise exception 'Super admin access required';
  end if;

  select jsonb_build_object(
    'users', (select count(*) from public.profiles),
    'online', (select count(*) from public.profiles where is_online and last_seen > now() - interval '45 seconds'),
    'messages', (select count(*) from public.messages),
    'messages_today', (select count(*) from public.messages where created_at >= date_trunc('day', now())),
    'conversations', (select count(*) from public.conversations),
    'calls_today', (select count(*) from public.calls where started_at >= date_trunc('day', now())),
    'open_reports', (select count(*) from public.reports where status in ('open', 'reviewing')),
    'suspended', (select count(*) from public.profiles where account_status = 'suspended'),
    'banned', (select count(*) from public.profiles where account_status = 'banned'),
    'generated_at', now()
  ) into result;

  return result;
end;
$$;

create or replace function public.admin_list_users(
  p_search text default '',
  p_status text default 'all',
  p_limit integer default 200
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.is_super_admin() then
    raise exception 'Super admin access required';
  end if;

  select coalesce(jsonb_agg(to_jsonb(rows) order by rows.created_at desc), '[]'::jsonb)
  into result
  from (
    select
      p.id,
      p.display_name,
      p.email,
      p.avatar_url,
      p.role,
      (p.is_online and p.last_seen > now() - interval '45 seconds') as is_online,
      p.last_seen,
      p.account_status,
      p.created_at,
      (select count(*) from public.reports r where r.reported_user_id = p.id) as report_count
    from public.profiles p
    where (p_status = 'all' or p.account_status = p_status)
      and (
        coalesce(trim(p_search), '') = ''
        or p.display_name ilike '%' || trim(p_search) || '%'
        or p.email ilike '%' || trim(p_search) || '%'
        or coalesce(p.virtual_number, '') ilike '%' || trim(p_search) || '%'
      )
    order by p.created_at desc
    limit least(greatest(coalesce(p_limit, 200), 1), 500)
  ) rows;

  return result;
end;
$$;

create or replace function public.admin_list_reports(
  p_status text default 'active',
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.is_super_admin() then
    raise exception 'Super admin access required';
  end if;

  select coalesce(jsonb_agg(to_jsonb(rows) order by rows.created_at desc), '[]'::jsonb)
  into result
  from (
    select
      r.id,
      r.reason,
      r.details,
      r.status,
      r.created_at,
      r.updated_at,
      r.resolved_at,
      r.reporter_id,
      reporter.display_name as reporter_name,
      r.reported_user_id,
      reported.display_name as reported_name,
      r.conversation_id,
      r.message_id,
      r.channel_id,
      r.assigned_admin_id,
      assigned.display_name as assigned_admin_name
    from public.reports r
    left join public.profiles reporter on reporter.id = r.reporter_id
    left join public.profiles reported on reported.id = r.reported_user_id
    left join public.profiles assigned on assigned.id = r.assigned_admin_id
    where p_status = 'all'
      or (p_status = 'active' and r.status in ('open', 'reviewing'))
      or r.status = p_status
    order by r.created_at desc
    limit least(greatest(coalesce(p_limit, 100), 1), 300)
  ) rows;

  return result;
end;
$$;

create or replace function public.admin_list_moderation_actions(p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.is_super_admin() then
    raise exception 'Super admin access required';
  end if;

  select coalesce(jsonb_agg(to_jsonb(rows) order by rows.created_at desc), '[]'::jsonb)
  into result
  from (
    select
      a.id,
      a.action_type,
      a.reason,
      a.metadata,
      a.created_at,
      a.admin_id,
      admin.display_name as admin_name,
      a.target_user_id,
      target.display_name as target_name,
      a.report_id
    from public.moderation_actions a
    left join public.profiles admin on admin.id = a.admin_id
    left join public.profiles target on target.id = a.target_user_id
    order by a.created_at desc
    limit least(greatest(coalesce(p_limit, 100), 1), 300)
  ) rows;

  return result;
end;
$$;

create or replace function public.admin_set_account_status(
  p_user_id uuid,
  p_status text,
  p_reason text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_role text;
begin
  if not public.is_super_admin() then
    raise exception 'Super admin access required';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'You cannot change your own account status';
  end if;
  if p_status not in ('active', 'suspended', 'banned') then
    raise exception 'Invalid account status';
  end if;
  if p_status <> 'active' and length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'A reason is required';
  end if;

  select role into target_role from public.profiles where id = p_user_id;
  if target_role is null then
    raise exception 'User not found';
  end if;
  if target_role = 'super_admin' then
    raise exception 'Another super admin cannot be restricted here';
  end if;

  update public.profiles set account_status = p_status where id = p_user_id;

  insert into public.moderation_actions(admin_id, target_user_id, action_type, reason)
  values (
    auth.uid(),
    p_user_id,
    case p_status when 'active' then 'reactivate' when 'suspended' then 'suspend' else 'ban' end,
    trim(coalesce(p_reason, ''))
  );
end;
$$;

create or replace function public.admin_update_report_status(
  p_report_id uuid,
  p_status text,
  p_reason text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Super admin access required';
  end if;
  if p_status not in ('open', 'reviewing', 'resolved', 'dismissed') then
    raise exception 'Invalid report status';
  end if;

  update public.reports
  set
    status = p_status,
    assigned_admin_id = case when p_status = 'open' then null else auth.uid() end,
    resolved_at = case when p_status in ('resolved', 'dismissed') then now() else null end,
    updated_at = now()
  where id = p_report_id;

  if not found then
    raise exception 'Report not found';
  end if;

  insert into public.moderation_actions(admin_id, report_id, action_type, reason)
  values (
    auth.uid(),
    p_report_id,
    case p_status
      when 'reviewing' then 'review_report'
      when 'resolved' then 'resolve_report'
      when 'dismissed' then 'dismiss_report'
      else 'review_report'
    end,
    trim(coalesce(p_reason, ''))
  );
end;
$$;

create or replace function public.admin_resolve_report(
  p_report_id uuid,
  p_status text,
  p_reason text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('resolved', 'dismissed') then
    raise exception 'Invalid report status';
  end if;
  perform public.admin_update_report_status(p_report_id, p_status, p_reason);
end;
$$;

revoke all on function public.admin_dashboard_overview() from public;
revoke all on function public.admin_list_users(text, text, integer) from public;
revoke all on function public.admin_list_reports(text, integer) from public;
revoke all on function public.admin_list_moderation_actions(integer) from public;
revoke all on function public.admin_set_account_status(uuid, text, text) from public;
revoke all on function public.admin_update_report_status(uuid, text, text) from public;
revoke all on function public.admin_resolve_report(uuid, text, text) from public;

grant execute on function public.admin_dashboard_overview() to authenticated;
grant execute on function public.admin_list_users(text, text, integer) to authenticated;
grant execute on function public.admin_list_reports(text, integer) to authenticated;
grant execute on function public.admin_list_moderation_actions(integer) to authenticated;
grant execute on function public.admin_set_account_status(uuid, text, text) to authenticated;
grant execute on function public.admin_update_report_status(uuid, text, text) to authenticated;
grant execute on function public.admin_resolve_report(uuid, text, text) to authenticated;

update public.profiles
set is_online = false
where is_online and last_seen <= now() - interval '45 seconds';

notify pgrst, 'reload schema';

commit;
