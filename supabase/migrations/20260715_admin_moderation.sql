begin;

alter table public.profiles add column if not exists account_status text not null default 'active';
do $$ begin
  alter table public.profiles add constraint profiles_account_status_check
    check (account_status in ('active','suspended','banned'));
exception when duplicate_object then null; end $$;

create index if not exists idx_profiles_account_status on public.profiles(account_status);

create or replace function public.admin_set_account_status(p_user_id uuid, p_status text, p_reason text default '')
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'Super admin access required'; end if;
  if p_user_id = auth.uid() then raise exception 'You cannot suspend your own account'; end if;
  if p_status not in ('active','suspended','banned') then raise exception 'Invalid account status'; end if;
  update public.profiles set account_status = p_status where id = p_user_id;
  if not found then raise exception 'User not found'; end if;
  insert into public.moderation_actions(admin_id,target_user_id,action_type,reason)
  values (auth.uid(),p_user_id,case when p_status='active' then 'unban' else 'ban' end,p_reason);
end $$;

create or replace function public.admin_resolve_report(p_report_id uuid, p_status text, p_reason text default '')
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'Super admin access required'; end if;
  if p_status not in ('resolved','dismissed') then raise exception 'Invalid report status'; end if;
  update public.reports set status=p_status,assigned_admin_id=auth.uid(),resolved_at=now() where id=p_report_id;
  if not found then raise exception 'Report not found'; end if;
  insert into public.moderation_actions(admin_id,report_id,action_type,reason)
  values(auth.uid(),p_report_id,case when p_status='resolved' then 'resolve_report' else 'dismiss_report' end,p_reason);
end $$;

revoke all on function public.admin_set_account_status(uuid,text,text) from public;
revoke all on function public.admin_resolve_report(uuid,text,text) from public;
grant execute on function public.admin_set_account_status(uuid,text,text) to authenticated;
grant execute on function public.admin_resolve_report(uuid,text,text) to authenticated;

commit;
