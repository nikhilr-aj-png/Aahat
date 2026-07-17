create or replace function public.delete_message_for_me(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  update public.messages m
     set deleted_for_users = array_append(coalesce(m.deleted_for_users, '{}'::uuid[]), auth.uid())
   where m.id = p_message_id
     and not (auth.uid() = any(coalesce(m.deleted_for_users, '{}'::uuid[])))
     and public.is_conversation_member(m.conversation_id);

  if not found and not exists (
    select 1 from public.messages m
    where m.id = p_message_id and public.is_conversation_member(m.conversation_id)
  ) then
    raise exception 'Message not found or access denied';
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
  if auth.uid() is null or not public.is_conversation_member(p_conversation_id) then
    raise exception 'Conversation not found or access denied';
  end if;

  update public.messages
     set deleted_for_users = array_append(coalesce(deleted_for_users, '{}'::uuid[]), auth.uid())
   where conversation_id = p_conversation_id
     and not (auth.uid() = any(coalesce(deleted_for_users, '{}'::uuid[])));
  get diagnostics affected = row_count;

  update public.conversation_members
     set unread_count = 0, last_read_at = now()
   where conversation_id = p_conversation_id and user_id = auth.uid();

  return affected;
end;
$$;

create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_conversation_member(p_conversation_id) then
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
