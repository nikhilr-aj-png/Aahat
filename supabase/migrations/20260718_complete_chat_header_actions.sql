begin;

alter table public.conversation_members
  add column if not exists is_deleted boolean not null default false;

create index if not exists conversation_members_visible_user_idx
  on public.conversation_members(user_id, is_deleted, conversation_id);

create or replace function public.delete_conversation_for_me(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.is_conversation_member(p_conversation_id) then
    raise exception 'Not a conversation member';
  end if;

  perform public.clear_conversation_for_me(p_conversation_id);
  update public.conversation_members
     set is_deleted = true,
         is_archived = false,
         is_pinned = false,
         unread_count = 0
   where conversation_id = p_conversation_id
     and user_id = auth.uid();
end;
$$;

revoke all on function public.delete_conversation_for_me(uuid) from public;
grant execute on function public.delete_conversation_for_me(uuid) to authenticated;

create or replace function public.restore_deleted_conversation_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversation_members
     set is_deleted = false
   where conversation_id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists trg_restore_deleted_conversation on public.messages;
create trigger trg_restore_deleted_conversation
after insert on public.messages
for each row execute function public.restore_deleted_conversation_on_message();

create or replace function public.search_conversation_messages(
  p_conversation_id uuid,
  p_query text,
  p_limit integer default 100
)
returns table (
  id uuid,
  conversation_id uuid,
  sender_id uuid,
  content text,
  message_type text,
  attachment_url text,
  attachment_name text,
  attachment_size bigint,
  attachment_mime_type text,
  reply_to_id uuid,
  created_at timestamptz,
  edited_at timestamptz,
  is_edited boolean,
  sender_name text,
  sender_avatar text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    m.id, m.conversation_id, m.sender_id, m.content, m.message_type,
    m.attachment_url, m.attachment_name, m.attachment_size, m.attachment_mime_type,
    m.reply_to_id, m.created_at, m.edited_at, m.is_edited,
    coalesce(p.display_name, 'Unknown') as sender_name,
    coalesce(p.avatar_url, '') as sender_avatar
  from public.messages m
  left join public.profiles p on p.id = m.sender_id
  where public.is_conversation_member(p_conversation_id)
    and m.conversation_id = p_conversation_id
    and not m.is_deleted_for_everyone
    and not (auth.uid() = any(coalesce(m.deleted_for_users, '{}'::uuid[])))
    and (
      coalesce(m.content, '') ilike '%' || trim(p_query) || '%'
      or coalesce(m.attachment_name, '') ilike '%' || trim(p_query) || '%'
    )
  order by m.created_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 200);
$$;

revoke all on function public.search_conversation_messages(uuid,text,integer) from public;
grant execute on function public.search_conversation_messages(uuid,text,integer) to authenticated;

create or replace function public.list_conversation_media(
  p_conversation_id uuid,
  p_limit integer default 250
)
returns table (
  id uuid,
  conversation_id uuid,
  sender_id uuid,
  message_type text,
  attachment_url text,
  attachment_name text,
  attachment_size bigint,
  attachment_mime_type text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    m.id, m.conversation_id, m.sender_id, m.message_type,
    m.attachment_url, m.attachment_name, m.attachment_size,
    m.attachment_mime_type, m.created_at
  from public.messages m
  where public.is_conversation_member(p_conversation_id)
    and m.conversation_id = p_conversation_id
    and m.attachment_url is not null
    and not m.is_deleted_for_everyone
    and not (auth.uid() = any(coalesce(m.deleted_for_users, '{}'::uuid[])))
  order by m.created_at desc
  limit least(greatest(coalesce(p_limit, 250), 1), 500);
$$;

revoke all on function public.list_conversation_media(uuid,integer) from public;
grant execute on function public.list_conversation_media(uuid,integer) to authenticated;

create table if not exists public.calls (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  initiator_id uuid not null references public.profiles(id) on delete cascade,
  call_type text not null check (call_type in ('voice','video')),
  status text not null default 'ringing' check (status in ('ringing','active','ended','missed','rejected','busy')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_seconds integer not null default 0
);

create table if not exists public.call_participants (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references public.calls(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  is_muted boolean not null default false,
  is_camera_off boolean not null default false,
  joined_at timestamptz default now(),
  left_at timestamptz,
  unique(call_id,user_id)
);

create table if not exists public.call_signaling (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references public.calls(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  signal_type text not null check (signal_type in ('offer','answer','ice_candidate','hangup','reject')),
  signal_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.calls enable row level security;
alter table public.call_participants enable row level security;
alter table public.call_signaling enable row level security;

drop policy if exists calls_select_member on public.calls;
create policy calls_select_member on public.calls for select to authenticated
using (public.is_conversation_member(conversation_id));

drop policy if exists calls_insert_member on public.calls;
create policy calls_insert_member on public.calls for insert to authenticated
with check (initiator_id = auth.uid() and public.is_conversation_member(conversation_id));

drop policy if exists calls_update_member on public.calls;
create policy calls_update_member on public.calls for update to authenticated
using (public.is_conversation_member(conversation_id))
with check (public.is_conversation_member(conversation_id));

drop policy if exists call_parts_select on public.call_participants;
create policy call_parts_select on public.call_participants for select to authenticated
using (exists (
  select 1 from public.calls c
  where c.id = call_id and public.is_conversation_member(c.conversation_id)
));

drop policy if exists call_parts_insert_own on public.call_participants;
create policy call_parts_insert_own on public.call_participants for insert to authenticated
with check (user_id = auth.uid() and exists (
  select 1 from public.calls c
  where c.id = call_id and public.is_conversation_member(c.conversation_id)
));

drop policy if exists call_parts_update_own on public.call_participants;
create policy call_parts_update_own on public.call_participants for update to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists signaling_select_participant on public.call_signaling;
create policy signaling_select_participant on public.call_signaling for select to authenticated
using (sender_id = auth.uid() or receiver_id = auth.uid());

drop policy if exists signaling_insert_sender on public.call_signaling;
create policy signaling_insert_sender on public.call_signaling for insert to authenticated
with check (
  sender_id = auth.uid()
  and sender_id <> receiver_id
  and exists (
    select 1 from public.calls c
    join public.conversation_members receiver_member
      on receiver_member.conversation_id = c.conversation_id
     and receiver_member.user_id = receiver_id
    where c.id = call_id
      and public.is_conversation_member(c.conversation_id)
  )
);

create index if not exists calls_conversation_started_idx
  on public.calls(conversation_id, started_at desc);
create index if not exists call_signaling_receiver_created_idx
  on public.call_signaling(receiver_id, created_at desc);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'call_signaling'
  ) then
    alter publication supabase_realtime add table public.call_signaling;
  end if;
end $$;

create or replace function public.create_incoming_call_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_name text;
  call_row public.calls%rowtype;
begin
  if new.signal_type <> 'offer' then return new; end if;
  select * into call_row from public.calls where id = new.call_id;
  if call_row.id is null then return new; end if;
  select coalesce(display_name, 'Someone') into caller_name
    from public.profiles where id = new.sender_id;

  insert into public.user_notifications(user_id, type, title, body, data)
  values (
    new.receiver_id,
    'call',
    caller_name,
    case when call_row.call_type = 'video' then 'Incoming video call' else 'Incoming voice call' end,
    jsonb_build_object(
      'call_id', new.call_id,
      'conversation_id', call_row.conversation_id,
      'sender_id', new.sender_id,
      'call_type', call_row.call_type
    )
  );
  return new;
end;
$$;

drop trigger if exists trg_incoming_call_notification on public.call_signaling;
create trigger trg_incoming_call_notification
after insert on public.call_signaling
for each row execute function public.create_incoming_call_notification();

create or replace function public.dispatch_message_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.type not in ('message','call') then return new; end if;
  perform net.http_post(
    url := 'https://jxyobyinvflojrhrdcrf.supabase.co/functions/v1/send-message-push',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('notification_id', new.id),
    timeout_milliseconds := 5000
  );
  return new;
end;
$$;

commit;