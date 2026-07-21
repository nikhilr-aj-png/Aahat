-- Admin-initiated permanent account deletion.
-- Suspend / ban / reactivate already exist (admin_set_account_status). This adds
-- a hard-delete path: a super admin can permanently remove another account.
--
-- The privileged auth.users deletion runs in the `admin-delete-user` Edge
-- Function (service role only). This migration provides the *authorization and
-- audit* half: a SECURITY DEFINER RPC that enforces the same guards as the
-- other admin RPCs and records the decision BEFORE the row disappears, so the
-- audit trail survives the profile cascade.

-- 1. Allow the new action_type in the moderation audit log (additive rebuild,
--    matching the pattern established in 202607190002_premium_admin_center.sql).
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
      'review_report', 'dismiss_report', 'resolve_report', 'delete_user'
    ));
exception when duplicate_object then null;
end $$;

-- 2. Validate + audit an account deletion. Runs as the calling admin so
--    is_super_admin() and auth.uid() reflect the real caller. Because
--    moderation_actions.target_user_id is ON DELETE SET NULL, we snapshot the
--    deleted user's identity into metadata so the audit entry stays meaningful
--    after the account (and its profile) is gone.
create or replace function public.admin_prepare_user_deletion(
  p_user_id uuid,
  p_reason text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_role text;
  target_name text;
  target_email text;
begin
  if not public.is_super_admin() then
    raise exception 'Super admin access required';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'You cannot delete your own account here';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'A reason is required';
  end if;

  select role, display_name, email
    into target_role, target_name, target_email
  from public.profiles
  where id = p_user_id;

  if target_role is null then
    raise exception 'User not found';
  end if;
  if target_role = 'super_admin' then
    raise exception 'Another super admin cannot be deleted here';
  end if;

  insert into public.moderation_actions(admin_id, target_user_id, action_type, reason, metadata)
  values (
    auth.uid(),
    p_user_id,
    'delete_user',
    trim(coalesce(p_reason, '')),
    jsonb_build_object(
      'deleted_user_id', p_user_id,
      'display_name', target_name,
      'email', target_email
    )
  );
end;
$$;

revoke all on function public.admin_prepare_user_deletion(uuid, text) from public;
grant execute on function public.admin_prepare_user_deletion(uuid, text) to authenticated;
