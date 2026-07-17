-- Break the channels <-> channel_members RLS recursion with owner-executed
-- helpers that still evaluate the caller through auth.uid().
create or replace function public.is_public_channel(p_channel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.channels c
    where c.id = p_channel_id and c.type = 'public'
  );
$$;

create or replace function public.is_channel_member(p_channel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and exists (
    select 1 from public.channel_members cm
    where cm.channel_id = p_channel_id and cm.user_id = auth.uid()
  );
$$;

create or replace function public.is_channel_admin(p_channel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and exists (
    select 1 from public.channel_members cm
    where cm.channel_id = p_channel_id
      and cm.user_id = auth.uid()
      and cm.role = 'admin'
  );
$$;

revoke all on function public.is_public_channel(uuid) from public;
revoke all on function public.is_channel_member(uuid) from public;
revoke all on function public.is_channel_admin(uuid) from public;
grant execute on function public.is_public_channel(uuid) to authenticated;
grant execute on function public.is_channel_member(uuid) to authenticated;
grant execute on function public.is_channel_admin(uuid) to authenticated;

drop policy if exists "channels_select_public" on public.channels;
create policy "channels_select_public" on public.channels
  for select to authenticated
  using (type = 'public' or public.is_channel_member(id));

drop policy if exists "channels_update_admin" on public.channels;
create policy "channels_update_admin" on public.channels
  for update to authenticated
  using (public.is_channel_admin(id))
  with check (public.is_channel_admin(id));

drop policy if exists "channels_delete_admin" on public.channels;
create policy "channels_delete_admin" on public.channels
  for delete to authenticated
  using (public.is_channel_admin(id));

drop policy if exists "ch_members_select" on public.channel_members;
create policy "ch_members_select" on public.channel_members
  for select to authenticated
  using (user_id = auth.uid() or public.is_public_channel(channel_id));

drop policy if exists "ch_members_insert" on public.channel_members;
create policy "ch_members_insert" on public.channel_members
  for insert to authenticated
  with check (user_id = auth.uid() or public.is_channel_admin(channel_id));

drop policy if exists "ch_members_delete" on public.channel_members;
create policy "ch_members_delete" on public.channel_members
  for delete to authenticated
  using (user_id = auth.uid() or public.is_channel_admin(channel_id));

drop policy if exists "ch_posts_select_member" on public.channel_posts;
create policy "ch_posts_select_member" on public.channel_posts
  for select to authenticated
  using (public.is_public_channel(channel_id) or public.is_channel_member(channel_id));

drop policy if exists "ch_posts_insert_admin" on public.channel_posts;
create policy "ch_posts_insert_admin" on public.channel_posts
  for insert to authenticated
  with check (author_id = auth.uid() and public.is_channel_admin(channel_id));

drop policy if exists "ch_posts_delete_admin" on public.channel_posts;
create policy "ch_posts_delete_admin" on public.channel_posts
  for delete to authenticated
  using (author_id = auth.uid() or public.is_channel_admin(channel_id));

grant select, insert, update, delete on public.channels to authenticated;
grant select, insert, delete on public.channel_members to authenticated;
grant select, insert, delete on public.channel_posts to authenticated;
