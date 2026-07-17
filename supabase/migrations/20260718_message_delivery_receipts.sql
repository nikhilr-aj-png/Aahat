begin;

create or replace function public.mark_message_delivered(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_conversation_id uuid;
  target_sender_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select m.conversation_id, m.sender_id
    into target_conversation_id, target_sender_id
    from public.messages m
   where m.id = p_message_id
     and not m.is_deleted_for_everyone;

  if target_conversation_id is null
     or target_sender_id = auth.uid()
     or not public.is_conversation_member(target_conversation_id) then
    raise exception 'Message not found or access denied';
  end if;

  insert into public.message_status(message_id, user_id, status, status_at)
  values (p_message_id, auth.uid(), 'delivered', now())
  on conflict (message_id, user_id)
  do update
     set status = case
                    when message_status.status = 'read' then 'read'
                    else excluded.status
                  end,
         status_at = case
                       when message_status.status = 'read' then message_status.status_at
                       else excluded.status_at
                     end;
end;
$$;

create or replace function public.mark_pending_messages_delivered()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  insert into public.message_status(message_id, user_id, status, status_at)
  select m.id, auth.uid(), 'delivered', now()
    from public.messages m
   where m.sender_id <> auth.uid()
     and not m.is_deleted_for_everyone
     and public.is_conversation_member(m.conversation_id)
     and not (auth.uid() = any(coalesce(m.deleted_for_users, '{}'::uuid[])))
     and not exists (
       select 1
         from public.message_status existing
        where existing.message_id = m.id
          and existing.user_id = auth.uid()
     )
  on conflict (message_id, user_id) do nothing;

  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.mark_message_delivered(uuid) from public;
revoke all on function public.mark_pending_messages_delivered() from public;
grant execute on function public.mark_message_delivered(uuid) to authenticated;
grant execute on function public.mark_pending_messages_delivered() to authenticated;

commit;