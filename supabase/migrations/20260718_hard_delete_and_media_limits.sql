begin;

create table if not exists public.deleted_messages (
  message_id uuid primary key,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  deleted_by uuid not null references public.profiles(id) on delete cascade,
  original_message_type text not null,
  original_created_at timestamptz not null,
  deleted_at timestamptz not null default now(),
  had_attachment boolean not null default false,
  storage_bucket text,
  storage_path text,
  storage_cleanup_status text not null default 'none' check (storage_cleanup_status in ('none','pending','deleted','failed')),
  storage_cleanup_error text
);

alter table public.deleted_messages enable row level security;
drop policy if exists "deleted_messages_select_members" on public.deleted_messages;
create policy "deleted_messages_select_members"
on public.deleted_messages for select to authenticated
using (public.is_conversation_member(conversation_id));

revoke all on public.deleted_messages from anon;
revoke insert, update, delete on public.deleted_messages from authenticated;
grant select on public.deleted_messages to authenticated;

create or replace function public.delete_message_for_everyone(p_message_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.messages%rowtype;
  marker constant text := '/storage/v1/object/public/';
  storage_tail text;
  bucket_name text;
  object_path text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into target from public.messages
   where id = p_message_id
   for update;

  if not found or target.sender_id <> auth.uid() then
    raise exception 'Only the sender can delete this message for everyone';
  end if;
  if target.created_at < now() - interval '12 hours' then
    raise exception 'Delete for everyone is available for 12 hours after sending';
  end if;

  if target.attachment_url is not null and position(marker in target.attachment_url) > 0 then
    storage_tail := split_part(target.attachment_url, marker, 2);
    bucket_name := split_part(storage_tail, '/', 1);
    object_path := substr(storage_tail, length(bucket_name) + 2);
  end if;

  insert into public.deleted_messages(
    message_id, conversation_id, sender_id, deleted_by,
    original_message_type, original_created_at, had_attachment,
    storage_bucket, storage_path, storage_cleanup_status
  ) values (
    target.id, target.conversation_id, target.sender_id, auth.uid(),
    target.message_type, target.created_at, target.attachment_url is not null,
    bucket_name, object_path,
    case when bucket_name is not null and object_path is not null then 'pending' else 'none' end
  );

  delete from public.user_notifications where data ->> 'message_id' = target.id::text;
  delete from public.message_reactions where message_id = target.id;
  delete from public.message_status where message_id = target.id;
  if to_regclass('public.pinned_messages') is not null then
    execute 'delete from public.pinned_messages where message_id = $1' using target.id;
  end if;
  if to_regclass('public.starred_messages') is not null then
    execute 'delete from public.starred_messages where message_id = $1' using target.id;
  end if;
  delete from public.messages where id = target.id;

  return jsonb_build_object(
    'message_id', target.id,
    'conversation_id', target.conversation_id,
    'message_type', target.message_type,
    'storage_bucket', bucket_name,
    'storage_path', object_path
  );
end;
$$;

create or replace function public.complete_deleted_message_storage(
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
  update public.deleted_messages
     set storage_cleanup_status = case when p_success then 'deleted' else 'failed' end,
         storage_cleanup_error = case when p_success then null else left(coalesce(p_error, 'Storage cleanup failed'), 300) end
   where message_id = p_message_id and deleted_by = auth.uid();
  if not found then raise exception 'Deleted message audit not found'; end if;
  if p_success and to_regclass('public.storage_files') is not null then
    execute $cleanup$
      delete from public.storage_files sf
       using public.deleted_messages dm
       where dm.message_id = $1
         and sf.bucket_id = dm.storage_bucket
         and sf.object_path = dm.storage_path
    $cleanup$ using p_message_id;
  end if;
end;
$$;

revoke all on function public.delete_message_for_everyone(uuid) from public;
revoke all on function public.complete_deleted_message_storage(uuid,boolean,text) from public;
grant execute on function public.delete_message_for_everyone(uuid) to authenticated;
grant execute on function public.complete_deleted_message_storage(uuid,boolean,text) to authenticated;

drop policy if exists "Allow authenticated uploads" on storage.objects;
drop policy if exists "Allow authenticated updates" on storage.objects;
drop policy if exists "Allow authenticated deletes" on storage.objects;
create policy "Allow authenticated uploads"
on storage.objects for insert to authenticated
with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Allow authenticated updates"
on storage.objects for update to authenticated
using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Allow authenticated deletes"
on storage.objects for delete to authenticated
using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);
update storage.buckets
set file_size_limit = 26214400,
    allowed_mime_types = array[
      'image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime','application/pdf'
    ]
where id = 'attachments';

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'deleted_messages'
  ) then
    alter publication supabase_realtime add table public.deleted_messages;
  end if;
end $$;

commit;