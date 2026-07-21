begin;

-- =============================================================
-- Auto-expiring chat media
--
-- Flow:
--   1. Sender uploads to the (private) attachments / voice-notes bucket.
--   2. A trigger records the bucket + object path on the message row.
--   3. Conversation members read the object through a short-lived signed URL.
--      Storage SELECT is granted by joining back to messages.attachment_path,
--      so stripping the row instantly revokes read access.
--   4. The receiver downloads, then calls consume_message_attachment(), which
--      strips the attachment from the message for BOTH sides and queues the
--      storage purge.
--   5. The receiver deletes the object immediately (storage DELETE is granted
--      only for their own pending queue row). purge-expired-media sweeps
--      anything left behind.
-- =============================================================

-- ---- 1. Message columns -------------------------------------------------
alter table public.messages
  add column if not exists attachment_bucket text,
  add column if not exists attachment_path text,
  add column if not exists attachment_consumed_at timestamptz,
  add column if not exists attachment_consumed_by uuid references public.profiles(id) on delete set null,
  add column if not exists attachment_expired_type text;

-- Storage RLS resolves objects through this pair on every read.
create index if not exists idx_messages_attachment_object
  on public.messages (attachment_bucket, attachment_path)
  where attachment_path is not null;

-- ---- 2. Keep bucket/path in sync with the stored URL --------------------
-- Derived server-side so no client can point a message at someone else's
-- object or forget to record the path.
create or replace function public.messages_sync_attachment_object()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  marker constant text := '/storage/v1/object/public/';
  signed_marker constant text := '/storage/v1/object/sign/';
  tail text;
  bucket_name text;
  object_path text;
begin
  if new.attachment_url is null then
    new.attachment_bucket := null;
    new.attachment_path := null;
    return new;
  end if;

  if position(marker in new.attachment_url) > 0 then
    tail := split_part(new.attachment_url, marker, 2);
  elsif position(signed_marker in new.attachment_url) > 0 then
    tail := split_part(new.attachment_url, signed_marker, 2);
  else
    new.attachment_bucket := null;
    new.attachment_path := null;
    return new;
  end if;

  tail := split_part(tail, '?', 1);
  bucket_name := split_part(tail, '/', 1);
  object_path := substr(tail, length(bucket_name) + 2);
  if bucket_name = '' or object_path = '' then
    new.attachment_bucket := null;
    new.attachment_path := null;
    return new;
  end if;

  new.attachment_bucket := bucket_name;
  new.attachment_path := object_path;
  return new;
end;
$$;

drop trigger if exists trg_messages_sync_attachment_object on public.messages;
create trigger trg_messages_sync_attachment_object
  before insert or update of attachment_url on public.messages
  for each row execute function public.messages_sync_attachment_object();

-- Backfill history so existing media keeps working under signed URLs.
update public.messages
   set attachment_url = attachment_url
 where attachment_url is not null
   and attachment_path is null;

-- ---- 3. Upload ledger ---------------------------------------------------
-- The client already writes here on every upload; without the table the
-- insert failed silently and orphans became invisible.
create table if not exists public.storage_files (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  bucket_id text not null,
  object_path text not null,
  public_url text,
  mime_type text,
  file_size bigint,
  created_at timestamptz not null default now(),
  unique (bucket_id, object_path)
);

create index if not exists idx_storage_files_owner on public.storage_files (owner_id, created_at desc);

alter table public.storage_files enable row level security;

drop policy if exists "storage_files_select_owner" on public.storage_files;
create policy "storage_files_select_owner"
on public.storage_files for select to authenticated
using (owner_id = auth.uid());

drop policy if exists "storage_files_insert_owner" on public.storage_files;
create policy "storage_files_insert_owner"
on public.storage_files for insert to authenticated
with check (owner_id = auth.uid());

drop policy if exists "storage_files_delete_owner" on public.storage_files;
create policy "storage_files_delete_owner"
on public.storage_files for delete to authenticated
using (owner_id = auth.uid());

revoke all on public.storage_files from anon;
grant select, insert, delete on public.storage_files to authenticated;

-- ---- 4. Purge queue -----------------------------------------------------
create table if not exists public.attachment_purge_queue (
  message_id uuid primary key,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  requested_by uuid not null references public.profiles(id) on delete cascade,
  storage_bucket text not null,
  storage_path text not null,
  requested_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'deleted', 'failed')),
  attempts integer not null default 0,
  error text
);

create index if not exists idx_attachment_purge_pending
  on public.attachment_purge_queue (requested_at)
  where status = 'pending';

create index if not exists idx_attachment_purge_object
  on public.attachment_purge_queue (storage_bucket, storage_path);

alter table public.attachment_purge_queue enable row level security;

-- Readable by the two people involved so both clients can retry the delete.
drop policy if exists "attachment_purge_select_involved" on public.attachment_purge_queue;
create policy "attachment_purge_select_involved"
on public.attachment_purge_queue for select to authenticated
using (owner_id = auth.uid() or requested_by = auth.uid());

revoke all on public.attachment_purge_queue from anon;
revoke insert, update, delete on public.attachment_purge_queue from authenticated;
grant select on public.attachment_purge_queue to authenticated;

-- ---- 5. Consume ---------------------------------------------------------
-- Strips the attachment for everyone and queues the object purge. Runs as the
-- caller's identity: membership and sender checks are enforced here.
create or replace function public.consume_message_attachment(p_message_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.messages%rowtype;
  expired_type text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into target from public.messages
   where id = p_message_id
   for update;

  if not found then
    raise exception 'Message not found';
  end if;
  if not public.is_conversation_member(target.conversation_id) then
    raise exception 'Only conversation members can open this attachment';
  end if;

  -- Already consumed: report state, never re-queue.
  if target.attachment_url is null and target.attachment_path is null then
    return jsonb_build_object(
      'message_id', target.id,
      'already_consumed', true,
      'expired_type', target.attachment_expired_type
    );
  end if;

  -- The sender re-opening their own media must not destroy it for the receiver.
  if target.sender_id = auth.uid() then
    return jsonb_build_object('message_id', target.id, 'skipped', true);
  end if;

  expired_type := case
    when target.message_type in ('image', 'video', 'audio', 'voice_note', 'file') then target.message_type
    when target.attachment_mime_type like 'image/%' then 'image'
    when target.attachment_mime_type like 'video/%' then 'video'
    when target.attachment_mime_type like 'audio/%' then 'audio'
    else 'file'
  end;

  if target.attachment_bucket is not null and target.attachment_path is not null then
    insert into public.attachment_purge_queue(
      message_id, conversation_id, owner_id, requested_by, storage_bucket, storage_path
    ) values (
      target.id, target.conversation_id, target.sender_id, auth.uid(),
      target.attachment_bucket, target.attachment_path
    )
    on conflict (message_id) do nothing;
  end if;

  -- Clearing the row is what actually revokes read access: the storage SELECT
  -- policy resolves objects through messages.attachment_path.
  update public.messages
     set attachment_url = null,
         attachment_name = null,
         attachment_size = null,
         attachment_mime_type = null,
         attachment_bucket = null,
         attachment_path = null,
         attachment_expired_type = expired_type,
         attachment_consumed_at = now(),
         attachment_consumed_by = auth.uid()
   where id = target.id;

  delete from public.storage_files
   where bucket_id = target.attachment_bucket
     and object_path = target.attachment_path;

  return jsonb_build_object(
    'message_id', target.id,
    'expired_type', expired_type,
    'storage_bucket', target.attachment_bucket,
    'storage_path', target.attachment_path
  );
end;
$$;

-- ---- 6. Purge bookkeeping ----------------------------------------------
create or replace function public.complete_attachment_purge(
  p_message_id uuid,
  p_success boolean,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  update public.attachment_purge_queue
     set status = case when p_success then 'deleted' else 'pending' end,
         attempts = attempts + 1,
         error = case when p_success then null else left(coalesce(p_error, 'Storage purge failed'), 300) end
   where message_id = p_message_id
     and (owner_id = auth.uid() or requested_by = auth.uid());
  if not found then raise exception 'Attachment purge request not found'; end if;
end;
$$;

revoke all on function public.consume_message_attachment(uuid) from public;
revoke all on function public.complete_attachment_purge(uuid, boolean, text) from public;
grant execute on function public.consume_message_attachment(uuid) to authenticated;
grant execute on function public.complete_attachment_purge(uuid, boolean, text) to authenticated;

-- ---- 7. Orphan reconciliation ------------------------------------------
-- Objects in the media buckets that no live message references and that no
-- purge request covers. Service-role only; drained by purge-expired-media.
create or replace function public.list_orphaned_media_objects(p_limit integer default 200)
returns table (bucket_id text, object_path text, created_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select o.bucket_id, o.name, o.created_at
    from storage.objects o
   where o.bucket_id in ('attachments', 'voice-notes')
     and o.name not like '%.emptyFolderPlaceholder'
     -- Grace period: never touch an object mid-upload or mid-send.
     and o.created_at < now() - interval '1 hour'
     and not exists (
       select 1 from public.messages m
        where m.attachment_bucket = o.bucket_id
          and m.attachment_path = o.name
     )
   order by o.created_at
   limit greatest(1, least(coalesce(p_limit, 200), 1000));
$$;

revoke all on function public.list_orphaned_media_objects(integer) from public;
revoke all on function public.list_orphaned_media_objects(integer) from anon, authenticated;

create or replace function public.list_pending_attachment_purges(p_limit integer default 200)
returns table (message_id uuid, storage_bucket text, storage_path text, attempts integer)
language sql
security definer
set search_path = public
as $$
  select q.message_id, q.storage_bucket, q.storage_path, q.attempts
    from public.attachment_purge_queue q
   where q.status = 'pending'
   order by q.requested_at
   limit greatest(1, least(coalesce(p_limit, 200), 1000));
$$;

revoke all on function public.list_pending_attachment_purges(integer) from public;
revoke all on function public.list_pending_attachment_purges(integer) from anon, authenticated;

create or replace function public.finalize_media_purge(
  p_bucket text,
  p_path text,
  p_success boolean,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.attachment_purge_queue
     set status = case when p_success then 'deleted' else 'pending' end,
         attempts = attempts + 1,
         error = case when p_success then null else left(coalesce(p_error, 'Storage purge failed'), 300) end
   where storage_bucket = p_bucket and storage_path = p_path;
  if p_success then
    delete from public.storage_files where bucket_id = p_bucket and object_path = p_path;
  end if;
end;
$$;

revoke all on function public.finalize_media_purge(text, text, boolean, text) from public;
revoke all on function public.finalize_media_purge(text, text, boolean, text) from anon, authenticated;

-- ---- 8. Buckets go private ---------------------------------------------
update storage.buckets
   set public = false,
       file_size_limit = 26214400,
       allowed_mime_types = array[
         'image/jpeg', 'image/png', 'image/webp', 'image/gif',
         'video/mp4', 'video/webm', 'video/quicktime',
         'audio/mpeg', 'audio/mp4', 'audio/webm', 'audio/wav', 'audio/ogg',
         'application/pdf', 'application/zip',
         'application/msword',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'application/vnd.ms-excel',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
         'application/vnd.ms-powerpoint',
         'application/vnd.openxmlformats-officedocument.presentationml.presentation',
         'text/plain', 'text/csv'
       ]
 where id = 'attachments';

update storage.buckets
   set public = false
 where id = 'voice-notes';

-- ---- 9. Storage policies ------------------------------------------------
-- Anonymous read of chat media is revoked; membership decides every read.
drop policy if exists "Allow public select" on storage.objects;
drop policy if exists "voice_notes_public_read" on storage.objects;

drop policy if exists "chat_media_read_conversation_members" on storage.objects;
create policy "chat_media_read_conversation_members"
on storage.objects for select to authenticated
using (
  bucket_id in ('attachments', 'voice-notes')
  and (
    -- The uploader always keeps access to their own object.
    (storage.foldername(name))[1] = (auth.uid())::text
    -- Everyone else reads only while a message they can see still points here.
    or exists (
      select 1 from public.messages m
       where m.attachment_bucket = storage.objects.bucket_id
         and m.attachment_path = storage.objects.name
         and public.is_conversation_member(m.conversation_id)
    )
    -- Consuming strips the message, which is what revokes access. The consumer
    -- still has to see the row to delete it, so keep a narrow window open while
    -- their purge is pending. They have already downloaded the bytes.
    or exists (
      select 1 from public.attachment_purge_queue q
       where q.storage_bucket = storage.objects.bucket_id
         and q.storage_path = storage.objects.name
         and q.status = 'pending'
         and (q.requested_by = auth.uid() or q.owner_id = auth.uid())
    )
  )
);

-- The receiver cannot delete the uploader's object in general, but may delete
-- exactly the object they have just consumed, while its purge is pending.
drop policy if exists "chat_media_delete_consumer" on storage.objects;
create policy "chat_media_delete_consumer"
on storage.objects for delete to authenticated
using (
  bucket_id in ('attachments', 'voice-notes')
  and exists (
    select 1 from public.attachment_purge_queue q
     where q.storage_bucket = storage.objects.bucket_id
       and q.storage_path = storage.objects.name
       and q.status = 'pending'
       and (q.requested_by = auth.uid() or q.owner_id = auth.uid())
  )
);

-- voice-notes keeps the same owner write rules as attachments.
drop policy if exists "voice_notes_owner_insert" on storage.objects;
create policy "voice_notes_owner_insert"
on storage.objects for insert to authenticated
with check (bucket_id = 'voice-notes' and (storage.foldername(name))[1] = (auth.uid())::text);

commit;
