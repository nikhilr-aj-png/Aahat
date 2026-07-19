begin;

create table if not exists public.user_activity_privacy (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  show_last_seen boolean not null default true,
  show_online boolean not null default true,
  read_receipts boolean not null default true,
  is_online boolean not null default false,
  last_seen timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_activity_privacy enable row level security;

drop policy if exists activity_privacy_select_own on public.user_activity_privacy;
create policy activity_privacy_select_own on public.user_activity_privacy
  for select to authenticated using (user_id = auth.uid());

revoke all on public.user_activity_privacy from anon, authenticated;
grant select on public.user_activity_privacy to authenticated;

insert into public.user_activity_privacy(
  user_id, show_last_seen, show_online, read_receipts, is_online, last_seen
)
select
  p.id,
  coalesce((p.privacy_settings->>'last_seen')::boolean, true),
  coalesce((p.privacy_settings->>'online')::boolean, true),
  coalesce((p.privacy_settings->>'read_receipts')::boolean, true),
  case when coalesce((p.privacy_settings->>'online')::boolean, true)
    then coalesce(p.is_online, false) else false end,
  coalesce(p.last_seen, now())
from public.profiles p
on conflict (user_id) do update set
  show_last_seen = excluded.show_last_seen,
  show_online = excluded.show_online,
  read_receipts = excluded.read_receipts,
  is_online = excluded.is_online,
  last_seen = excluded.last_seen,
  updated_at = now();

create or replace function public.sync_profile_activity_privacy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_activity_privacy(
    user_id, show_last_seen, show_online, read_receipts, is_online, last_seen, updated_at
  ) values (
    new.id,
    coalesce((new.privacy_settings->>'last_seen')::boolean, true),
    coalesce((new.privacy_settings->>'online')::boolean, true),
    coalesce((new.privacy_settings->>'read_receipts')::boolean, true),
    case when coalesce((new.privacy_settings->>'online')::boolean, true)
      then coalesce(new.is_online, false) else false end,
    coalesce(new.last_seen, now()),
    now()
  )
  on conflict (user_id) do update set
    show_last_seen = excluded.show_last_seen,
    show_online = excluded.show_online,
    read_receipts = excluded.read_receipts,
    is_online = excluded.is_online,
    last_seen = excluded.last_seen,
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_sync_profile_activity_privacy on public.profiles;
create trigger trg_sync_profile_activity_privacy
after insert or update of privacy_settings, is_online, last_seen on public.profiles
for each row execute function public.sync_profile_activity_privacy();

create or replace function public.get_visible_contact_activity(p_user_ids uuid[])
returns table (
  user_id uuid,
  show_online boolean,
  show_last_seen boolean,
  last_seen timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    activity.user_id,
    activity.show_online and is_contact and not is_blocked as show_online,
    activity.show_last_seen and is_contact and not is_blocked as show_last_seen,
    case when activity.show_last_seen and is_contact and not is_blocked
      then activity.last_seen else null end as last_seen
  from public.user_activity_privacy activity
  cross join lateral (
    select exists (
      select 1 from public.user_contacts contacts
      where contacts.owner_id = auth.uid()
        and contacts.contact_id = activity.user_id
        and contacts.status = 'accepted'
    ) as is_contact
  ) contact_check
  cross join lateral (
    select exists (
      select 1 from public.blocked_users blocked
      where (blocked.blocker_id = auth.uid() and blocked.blocked_id = activity.user_id)
         or (blocked.blocker_id = activity.user_id and blocked.blocked_id = auth.uid())
    ) as is_blocked
  ) block_check
  where auth.uid() is not null
    and activity.user_id = any(coalesce(p_user_ids, '{}'::uuid[]))
    and cardinality(coalesce(p_user_ids, '{}'::uuid[])) <= 500;
$$;

create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  receipts_enabled boolean;
begin
  if auth.uid() is null or not public.is_conversation_member(p_conversation_id) then
    raise exception 'Conversation not found or access denied';
  end if;

  select coalesce(activity.read_receipts, true)
  into receipts_enabled
  from public.user_activity_privacy activity
  where activity.user_id = auth.uid();
  receipts_enabled := coalesce(receipts_enabled, true);

  insert into public.message_status(message_id, user_id, status, status_at)
  select
    message.id,
    auth.uid(),
    case when receipts_enabled then 'read' else 'delivered' end,
    now()
  from public.messages message
  where message.conversation_id = p_conversation_id
    and message.sender_id <> auth.uid()
    and not message.is_deleted_for_everyone
    and not (auth.uid() = any(coalesce(message.deleted_for_users, '{}'::uuid[])))
  on conflict (message_id, user_id) do update set
    status = case
      when public.message_status.status = 'read' then 'read'
      when receipts_enabled then 'read'
      else 'delivered'
    end,
    status_at = case
      when public.message_status.status = 'read' then public.message_status.status_at
      else excluded.status_at
    end;

  update public.conversation_members
  set unread_count = 0, last_read_at = now()
  where conversation_id = p_conversation_id and user_id = auth.uid();
end;
$$;

revoke all on function public.get_visible_contact_activity(uuid[]) from public, anon, authenticated;
revoke all on function public.mark_conversation_read(uuid) from public;
grant execute on function public.get_visible_contact_activity(uuid[]) to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
