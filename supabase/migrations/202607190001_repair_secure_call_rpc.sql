begin;

-- Repair migration for deployments where the secure-call migration did not
-- complete. It upgrades the legacy calls table in place and recreates the
-- RPCs used by the current WebRTC client.
create table if not exists public.calls (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  caller_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid references public.profiles(id) on delete cascade,
  type text not null,
  status text not null default 'ringing',
  started_at timestamptz not null default now(),
  answered_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer not null default 0,
  updated_at timestamptz not null default now()
);

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'calls' and column_name = 'initiator_id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'calls' and column_name = 'caller_id'
  ) then
    alter table public.calls rename column initiator_id to caller_id;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'calls' and column_name = 'call_type'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'calls' and column_name = 'type'
  ) then
    alter table public.calls rename column call_type to type;
  end if;
end
$$;

alter table public.calls
  add column if not exists caller_id uuid references public.profiles(id) on delete cascade,
  add column if not exists receiver_id uuid references public.profiles(id) on delete cascade,
  add column if not exists type text,
  add column if not exists answered_at timestamptz,
  add column if not exists duration_seconds integer not null default 0,
  add column if not exists updated_at timestamptz not null default now();

update public.calls set status = 'connected' where status = 'active';

update public.calls c
set receiver_id = (
  select cm.user_id
  from public.conversation_members cm
  where cm.conversation_id = c.conversation_id and cm.user_id <> c.caller_id
  order by cm.joined_at
  limit 1
)
where c.receiver_id is null and c.caller_id is not null;

alter table public.calls drop constraint if exists calls_status_check;
alter table public.calls drop constraint if exists calls_call_type_check;
alter table public.calls drop constraint if exists calls_type_check;
alter table public.calls drop constraint if exists calls_distinct_users_check;
alter table public.calls add constraint calls_status_check check (status in (
  'calling', 'ringing', 'connecting', 'connected', 'rejected', 'missed',
  'disconnected', 'failed', 'ended', 'busy'
));
alter table public.calls add constraint calls_type_check check (type in ('voice', 'video'));
alter table public.calls add constraint calls_distinct_users_check
  check (receiver_id is null or caller_id <> receiver_id);

create index if not exists calls_receiver_started_idx
  on public.calls(receiver_id, started_at desc);
create index if not exists calls_active_users_idx
  on public.calls(caller_id, receiver_id, status)
  where status in ('calling', 'ringing', 'connecting', 'connected', 'disconnected');

create or replace function public.is_call_participant(p_call_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and exists (
    select 1 from public.calls c
    where c.id = p_call_id
      and auth.uid() in (c.caller_id, c.receiver_id)
  );
$$;

create or replace function public.start_direct_call(
  p_conversation_id uuid,
  p_receiver_id uuid,
  p_type text
)
returns public.calls
language plpgsql
security definer
set search_path = public, realtime
as $$
declare
  caller uuid := auth.uid();
  created_call public.calls;
  first_user text;
  second_user text;
begin
  if caller is null then raise exception 'Authentication required'; end if;
  if p_type not in ('voice', 'video') then raise exception 'Unsupported call type'; end if;
  if p_receiver_id is null or p_receiver_id = caller then raise exception 'A receiver is required'; end if;
  if not public.is_conversation_member(p_conversation_id) or not exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = p_conversation_id and cm.user_id = p_receiver_id
  ) then
    raise exception 'Call participants must share this conversation';
  end if;

  first_user := least(caller::text, p_receiver_id::text);
  second_user := greatest(caller::text, p_receiver_id::text);
  perform pg_advisory_xact_lock(hashtextextended(first_user || ':' || second_user, 0));

  update public.calls
  set status = 'missed', ended_at = coalesce(ended_at, now()), updated_at = now()
  where status in ('calling', 'ringing')
    and started_at < now() - interval '60 seconds';

  if exists (
    select 1 from public.calls c
    where c.status in ('calling', 'ringing', 'connecting', 'connected', 'disconnected')
      and (caller in (c.caller_id, c.receiver_id) or p_receiver_id in (c.caller_id, c.receiver_id))
  ) then
    raise exception 'A participant is already in another call';
  end if;

  insert into public.calls(conversation_id, caller_id, receiver_id, type, status)
  values (p_conversation_id, caller, p_receiver_id, p_type, 'ringing')
  returning * into created_call;

  perform realtime.send(
    jsonb_build_object(
      'callId', created_call.id,
      'conversationId', created_call.conversation_id,
      'callerId', created_call.caller_id,
      'receiverId', created_call.receiver_id,
      'type', created_call.type,
      'status', created_call.status,
      'startedAt', created_call.started_at
    ),
    'invite',
    'call:user:' || p_receiver_id::text,
    true
  );

  return created_call;
end;
$$;

create or replace function public.set_call_status(p_call_id uuid, p_status text)
returns public.calls
language plpgsql
security definer
set search_path = public, realtime
as $$
declare
  updated_call public.calls;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_status not in (
    'calling', 'ringing', 'connecting', 'connected', 'rejected', 'missed',
    'disconnected', 'failed', 'ended', 'busy'
  ) then raise exception 'Unsupported call status';
  end if;

  update public.calls c
  set status = p_status,
      answered_at = case
        when p_status in ('connecting', 'connected') then coalesce(c.answered_at, now())
        else c.answered_at
      end,
      ended_at = case
        when p_status in ('rejected', 'missed', 'failed', 'ended', 'busy') then coalesce(c.ended_at, now())
        else c.ended_at
      end,
      updated_at = now()
  where c.id = p_call_id and auth.uid() in (c.caller_id, c.receiver_id)
  returning * into updated_call;

  if updated_call.id is null then raise exception 'Call not found or access denied'; end if;

  perform realtime.send(
    jsonb_build_object('callId', updated_call.id, 'status', updated_call.status, 'actorId', auth.uid()),
    'state',
    'call:' || updated_call.id::text,
    true
  );
  return updated_call;
end;
$$;

create or replace function public.can_access_call_realtime_topic(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  topic_id text;
begin
  if auth.uid() is null or p_topic is null then return false; end if;
  if p_topic like 'call:user:%' then
    return split_part(p_topic, ':', 3) = auth.uid()::text;
  end if;
  if p_topic ~ '^call:[0-9a-fA-F-]{36}$' then
    topic_id := split_part(p_topic, ':', 2);
    return public.is_call_participant(topic_id::uuid);
  end if;
  return false;
exception when invalid_text_representation then
  return false;
end;
$$;

alter table public.calls enable row level security;
drop policy if exists calls_select_member on public.calls;
drop policy if exists calls_insert_member on public.calls;
drop policy if exists calls_update_member on public.calls;
drop policy if exists calls_select_participants on public.calls;
create policy calls_select_participants on public.calls for select to authenticated
using (auth.uid() in (caller_id, receiver_id));

revoke insert, update, delete on public.calls from authenticated;
grant select on public.calls to authenticated;
revoke all on function public.is_call_participant(uuid) from public;
revoke all on function public.start_direct_call(uuid, uuid, text) from public;
revoke all on function public.set_call_status(uuid, text) from public;
revoke all on function public.can_access_call_realtime_topic(text) from public;
grant execute on function public.is_call_participant(uuid) to authenticated;
grant execute on function public.start_direct_call(uuid, uuid, text) to authenticated;
grant execute on function public.set_call_status(uuid, text) to authenticated;
grant execute on function public.can_access_call_realtime_topic(text) to authenticated;

drop policy if exists "call participants can receive private broadcasts" on realtime.messages;
create policy "call participants can receive private broadcasts"
on realtime.messages for select to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and public.can_access_call_realtime_topic(realtime.topic())
);

drop policy if exists "call participants can send private broadcasts" on realtime.messages;
create policy "call participants can send private broadcasts"
on realtime.messages for insert to authenticated
with check (
  realtime.messages.extension = 'broadcast'
  and public.can_access_call_realtime_topic(realtime.topic())
);

notify pgrst, 'reload schema';
commit;
