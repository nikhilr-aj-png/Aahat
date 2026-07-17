-- Avoid self-recursive conversation_members RLS checks. These SECURITY DEFINER
-- helpers read membership as the function owner while still checking the
-- caller identity supplied by auth.uid().
create or replace function public.is_conversation_member(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.conversation_members cm
      where cm.conversation_id = p_conversation_id
        and cm.user_id = auth.uid()
    );
$$;

create or replace function public.is_conversation_admin(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.conversation_members cm
      where cm.conversation_id = p_conversation_id
        and cm.user_id = auth.uid()
        and cm.role = 'admin'
    );
$$;

revoke all on function public.is_conversation_member(uuid) from public;
revoke all on function public.is_conversation_admin(uuid) from public;
grant execute on function public.is_conversation_member(uuid) to authenticated;
grant execute on function public.is_conversation_admin(uuid) to authenticated;

drop policy if exists "conv_members_select" on public.conversation_members;
create policy "conv_members_select" on public.conversation_members
  for select to authenticated
  using (public.is_conversation_member(conversation_id));

drop policy if exists "conv_members_delete" on public.conversation_members;
create policy "conv_members_delete" on public.conversation_members
  for delete to authenticated
  using (user_id = auth.uid() or public.is_conversation_admin(conversation_id));

drop policy if exists "conversations_select_member" on public.conversations;
create policy "conversations_select_member" on public.conversations
  for select to authenticated
  using (public.is_conversation_member(id));

drop policy if exists "conversations_update_member" on public.conversations;
create policy "conversations_update_member" on public.conversations
  for update to authenticated
  using (public.is_conversation_member(id))
  with check (public.is_conversation_member(id));

drop policy if exists "conversations_delete_admin" on public.conversations;
create policy "conversations_delete_admin" on public.conversations
  for delete to authenticated
  using (public.is_conversation_admin(id));
