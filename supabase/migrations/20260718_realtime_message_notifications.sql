begin;

create or replace function public.create_message_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  sender_name text;
  notification_body text;
begin
  if new.message_type = 'system' or new.is_deleted_for_everyone then
    return new;
  end if;

  select coalesce(nullif(trim(p.display_name), ''), 'Aahat user')
    into sender_name
    from public.profiles p
   where p.id = new.sender_id;

  notification_body := case
    when new.message_type = 'text' and nullif(trim(new.content), '') is not null
      then left(new.content, 180)
    when new.message_type = 'image' then 'Sent a photo'
    when new.message_type = 'video' then 'Sent a video'
    when new.message_type in ('audio', 'voice_note') then 'Sent a voice message'
    when new.message_type = 'file' then 'Sent a file'
    else coalesce(nullif(trim(new.content), ''), 'Sent a message')
  end;

  insert into public.user_notifications(user_id, type, title, body, data, is_read)
  select cm.user_id,
         'message',
         coalesce(sender_name, 'Aahat user'),
         notification_body,
         jsonb_build_object(
           'message_id', new.id,
           'conversation_id', new.conversation_id,
           'sender_id', new.sender_id,
           'message_type', new.message_type
         ),
         false
    from public.conversation_members cm
   where cm.conversation_id = new.conversation_id
     and cm.user_id <> new.sender_id;

  return new;
end;
$$;

drop trigger if exists trg_create_message_notifications on public.messages;
create trigger trg_create_message_notifications
after insert on public.messages
for each row execute function public.create_message_notifications();

drop policy if exists "notifications_insert" on public.user_notifications;
drop policy if exists "notifications_insert_own" on public.user_notifications;
create policy "notifications_insert_own"
on public.user_notifications
for insert to authenticated
with check (user_id = auth.uid());

commit;