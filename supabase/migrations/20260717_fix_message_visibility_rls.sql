-- Use the non-recursive membership helper for message reads and writes.
drop policy if exists "messages_select_member" on public.messages;
create policy "messages_select_member" on public.messages
  for select to authenticated
  using (public.is_conversation_member(conversation_id));

drop policy if exists "messages_insert_member" on public.messages;
create policy "messages_insert_member" on public.messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_conversation_member(conversation_id)
  );

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end;
$$;

grant select, insert on public.messages to authenticated;
