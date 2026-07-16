-- Aahat production-readiness migration
-- Safe, additive and idempotent. No user content is deleted.

begin;

create extension if not exists pgcrypto;

-- Settings device/session foundation. These tables may not exist on older
-- projects, so create them before applying additive production changes.
create table if not exists public.user_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_name text not null default 'Browser',
  platform text,
  device_fingerprint text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid references public.user_devices(id) on delete set null,
  client_session_id text,
  user_agent text,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.user_devices enable row level security;
alter table public.user_sessions enable row level security;

drop policy if exists "user_devices_select_own" on public.user_devices;
drop policy if exists "user_devices_insert_own" on public.user_devices;
drop policy if exists "user_devices_update_own" on public.user_devices;
drop policy if exists "user_devices_delete_own" on public.user_devices;
create policy "user_devices_select_own" on public.user_devices for select to authenticated using (user_id = auth.uid());
create policy "user_devices_insert_own" on public.user_devices for insert to authenticated with check (user_id = auth.uid());
create policy "user_devices_update_own" on public.user_devices for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "user_devices_delete_own" on public.user_devices for delete to authenticated using (user_id = auth.uid());

drop policy if exists "user_sessions_select_own" on public.user_sessions;
drop policy if exists "user_sessions_insert_own" on public.user_sessions;
drop policy if exists "user_sessions_update_own" on public.user_sessions;
drop policy if exists "user_sessions_delete_own" on public.user_sessions;
create policy "user_sessions_select_own" on public.user_sessions for select to authenticated using (user_id = auth.uid());
create policy "user_sessions_insert_own" on public.user_sessions for insert to authenticated with check (user_id = auth.uid());
create policy "user_sessions_update_own" on public.user_sessions for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "user_sessions_delete_own" on public.user_sessions for delete to authenticated using (user_id = auth.uid());

revoke all on public.user_devices from anon;
revoke all on public.user_sessions from anon;
grant select, insert, update, delete on public.user_devices to authenticated;
grant select, insert, update, delete on public.user_sessions to authenticated;

-- Device records need a stable, non-secret browser fingerprint so repeated
-- application starts update one row instead of creating duplicates.
alter table public.user_devices
  add column if not exists device_fingerprint text;

drop index if exists public.idx_user_devices_fingerprint;
create unique index idx_user_devices_fingerprint
  on public.user_devices(user_id, device_fingerprint);

-- Fix the original policy typo: it was declared as another SELECT policy,
-- which meant users could not actually unblock somebody.
drop policy if exists "blocked_delete_own" on public.blocked_users;
create policy "blocked_delete_own" on public.blocked_users
  for delete to authenticated
  using (blocker_id = auth.uid());

-- A conversation member may remove a pin. Stars remain private to their owner
-- through the existing starred_messages FOR ALL policy.
drop policy if exists "pinned_messages_member_delete" on public.pinned_messages;
create policy "pinned_messages_member_delete" on public.pinned_messages
  for delete to authenticated
  using (
    conversation_id in (
      select conversation_id from public.conversation_members
      where user_id = auth.uid()
    )
    or public.is_super_admin()
  );

-- Delete-for-me must work for received messages too. Updating messages directly
-- is intentionally sender-only, so this narrowly scoped SECURITY DEFINER RPC
-- performs the array update after validating conversation membership.
create or replace function public.delete_message_for_me(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  update public.messages m
     set deleted_for_users = array_append(m.deleted_for_users, auth.uid())
   where m.id = p_message_id
     and not (auth.uid() = any(coalesce(m.deleted_for_users, '{}'::uuid[])))
     and exists (
       select 1 from public.conversation_members cm
        where cm.conversation_id = m.conversation_id
          and cm.user_id = auth.uid()
     );

  if not found then
    if not exists (
      select 1 from public.messages m
      join public.conversation_members cm on cm.conversation_id = m.conversation_id
      where m.id = p_message_id and cm.user_id = auth.uid()
    ) then
      raise exception 'Message not found or access denied';
    end if;
  end if;
end;
$$;

create or replace function public.clear_conversation_for_me(p_conversation_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  if auth.uid() is null or not exists (
    select 1 from public.conversation_members
    where conversation_id = p_conversation_id and user_id = auth.uid()
  ) then
    raise exception 'Conversation not found or access denied';
  end if;

  update public.messages
     set deleted_for_users = array_append(deleted_for_users, auth.uid())
   where conversation_id = p_conversation_id
     and not (auth.uid() = any(coalesce(deleted_for_users, '{}'::uuid[])));
  get diagnostics affected = row_count;

  update public.conversation_members
     set unread_count = 0, last_read_at = now()
   where conversation_id = p_conversation_id and user_id = auth.uid();

  return affected;
end;
$$;

-- Mark every currently visible incoming message as read in one database call.
create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.conversation_members
    where conversation_id = p_conversation_id and user_id = auth.uid()
  ) then
    raise exception 'Conversation not found or access denied';
  end if;

  insert into public.message_status(message_id, user_id, status, status_at)
  select m.id, auth.uid(), 'read', now()
    from public.messages m
   where m.conversation_id = p_conversation_id
     and m.sender_id <> auth.uid()
     and not m.is_deleted_for_everyone
     and not (auth.uid() = any(coalesce(m.deleted_for_users, '{}'::uuid[])))
  on conflict (message_id, user_id)
  do update set status = 'read', status_at = excluded.status_at;

  update public.conversation_members
     set unread_count = 0, last_read_at = now()
   where conversation_id = p_conversation_id and user_id = auth.uid();
end;
$$;

revoke all on function public.delete_message_for_me(uuid) from public;
revoke all on function public.clear_conversation_for_me(uuid) from public;
revoke all on function public.mark_conversation_read(uuid) from public;
grant execute on function public.delete_message_for_me(uuid) to authenticated;
grant execute on function public.clear_conversation_for_me(uuid) to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

-- Keep status counters authoritative and race-free. The viewer only inserts a
-- status_views row; this trigger owns the aggregate counter update.
create or replace function public.sync_status_view_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.statuses set view_count = view_count + 1 where id = new.status_id;
    return new;
  end if;
  update public.statuses set view_count = greatest(0, view_count - 1) where id = old.status_id;
  return old;
end;
$$;

drop trigger if exists trg_sync_status_view_count on public.status_views;
create trigger trg_sync_status_view_count
after insert or delete on public.status_views
for each row execute function public.sync_status_view_count();

update public.statuses s
   set view_count = (select count(*) from public.status_views sv where sv.status_id = s.id)
 where s.view_count is distinct from (select count(*) from public.status_views sv where sv.status_id = s.id);

-- Channel subscriber totals are derived from channel_members, avoiding client
-- races and RLS failures when a normal subscriber follows/unfollows.
create or replace function public.sync_channel_subscriber_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_channel uuid := coalesce(new.channel_id, old.channel_id);
begin
  update public.channels c
     set subscriber_count = (
       select count(*) from public.channel_members cm where cm.channel_id = target_channel
     )
   where c.id = target_channel;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_sync_channel_subscriber_count on public.channel_members;
create trigger trg_sync_channel_subscriber_count
after insert or delete on public.channel_members
for each row execute function public.sync_channel_subscriber_count();

update public.channels c
   set subscriber_count = (select count(*) from public.channel_members cm where cm.channel_id = c.id)
 where c.subscriber_count is distinct from (select count(*) from public.channel_members cm where cm.channel_id = c.id);

-- Preserve message edit history without trusting the client to write it.
create or replace function public.capture_message_edit_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.content is distinct from old.content and new.is_edited then
    insert into public.message_edit_history(message_id, editor_id, old_content, new_content)
    values (new.id, auth.uid(), old.content, new.content);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_capture_message_edit_history on public.messages;
create trigger trg_capture_message_edit_history
after update of content on public.messages
for each row execute function public.capture_message_edit_history();

-- Realtime is required by the client. Add tables only when absent so the
-- migration remains safe to re-run on projects already configured manually.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'messages','message_reactions','message_status','conversation_members',
    'profiles','statuses','status_views','calls','call_signaling',
    'channels','channel_members','channel_posts','user_notifications'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end $$;

commit;
