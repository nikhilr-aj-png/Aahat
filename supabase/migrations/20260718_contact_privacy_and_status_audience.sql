begin;

-- Status audiences are stored per status so a later privacy-setting change
-- cannot silently widen an already-published story.
alter table public.statuses drop constraint if exists statuses_privacy_check;
alter table public.statuses
  add constraint statuses_privacy_check
  check (privacy in ('everyone', 'contacts', 'selected', 'private'));

create table if not exists public.status_audience_members (
  status_id uuid not null references public.statuses(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (status_id, user_id)
);

create index if not exists status_audience_members_user_idx
  on public.status_audience_members(user_id, status_id);

alter table public.status_audience_members enable row level security;
revoke all on public.status_audience_members from anon, authenticated;

create or replace function public.can_view_status(
  p_status_id uuid,
  p_owner_id uuid,
  p_privacy text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and (
      auth.uid() = p_owner_id
      or (
        not exists (
          select 1 from public.blocked_users b
          where (b.blocker_id = p_owner_id and b.blocked_id = auth.uid())
             or (b.blocker_id = auth.uid() and b.blocked_id = p_owner_id)
        )
        and (
          p_privacy = 'everyone'
          or (
            p_privacy = 'contacts'
            and exists (
              select 1 from public.user_contacts uc
              where uc.owner_id = p_owner_id
                and uc.contact_id = auth.uid()
                and uc.status = 'accepted'
            )
          )
          or (
            p_privacy = 'selected'
            and exists (
              select 1 from public.status_audience_members sam
              where sam.status_id = p_status_id and sam.user_id = auth.uid()
            )
          )
        )
      )
    );
$$;

drop policy if exists "statuses_select_visible" on public.statuses;
create policy "statuses_select_visible" on public.statuses
  for select to authenticated
  using (public.can_view_status(id, user_id, privacy));

drop policy if exists "status_views_insert_own" on public.status_views;
create policy "status_views_insert_own" on public.status_views
  for insert to authenticated
  with check (
    viewer_id = auth.uid()
    and exists (select 1 from public.statuses s where s.id = status_id)
  );

create or replace function public.create_aahat_status(
  p_type text,
  p_content text default null,
  p_media_url text default null,
  p_bg_gradient text default null,
  p_privacy text default 'contacts',
  p_selected_contact_ids uuid[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  created_status_id uuid;
  selected_ids uuid[];
begin
  if caller_id is null then raise exception 'Authentication required'; end if;
  if p_type not in ('text', 'image', 'video') then raise exception 'Unsupported status type'; end if;
  if p_privacy not in ('everyone', 'contacts', 'selected', 'private') then
    raise exception 'Unsupported status audience';
  end if;
  if p_type = 'text' and nullif(btrim(coalesce(p_content, '')), '') is null then
    raise exception 'Text status cannot be empty';
  end if;
  if p_type <> 'text' and nullif(btrim(coalesce(p_media_url, '')), '') is null then
    raise exception 'Status media is required';
  end if;

  select coalesce(array_agg(distinct selected_id), '{}') into selected_ids
  from unnest(coalesce(p_selected_contact_ids, '{}')) selected_id
  where selected_id <> caller_id;

  if p_privacy = 'selected' and cardinality(selected_ids) = 0 then
    raise exception 'Select at least one contact for this status';
  end if;

  if p_privacy = 'selected' and exists (
    select 1 from unnest(selected_ids) selected_id
    where not exists (
      select 1 from public.user_contacts uc
      where uc.owner_id = caller_id
        and uc.contact_id = selected_id
        and uc.status = 'accepted'
    )
  ) then
    raise exception 'Status audience can only include accepted contacts';
  end if;

  insert into public.statuses(user_id, type, content, media_url, bg_gradient, privacy)
  values (
    caller_id,
    p_type,
    case when p_type = 'text' then btrim(p_content) else null end,
    case when p_type <> 'text' then p_media_url else null end,
    p_bg_gradient,
    p_privacy
  ) returning id into created_status_id;

  if p_privacy = 'selected' then
    insert into public.status_audience_members(status_id, user_id)
    select created_status_id, selected_id from unnest(selected_ids) selected_id;
  end if;

  return created_status_id;
end;
$$;

-- Public profiles connect immediately by Aahat ID. Private profiles keep the
-- existing ID + PIN + recipient-acceptance flow.
create or replace function public.connect_by_aahat_id(
  p_aahat_id text,
  p_pin_code text default null
)
returns table (
  conversation_id uuid,
  request_id uuid,
  recipient_id uuid,
  display_name text,
  avatar_url text,
  connection_mode text,
  request_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  target public.profiles%rowtype;
  target_mode text;
  saved_request public.contact_requests%rowtype;
  direct_conversation_id uuid;
  recent_attempts integer;
begin
  if caller_id is null then raise exception 'Authentication required'; end if;
  if p_aahat_id !~ '^\d{10}$' then raise exception 'Enter a valid 10-digit Aahat ID'; end if;

  delete from public.aahat_pin_attempts where attempted_at < now() - interval '1 day';
  select count(*) into recent_attempts
  from public.aahat_pin_attempts apa
  where apa.requester_id = caller_id and apa.attempted_at > now() - interval '15 minutes';
  if recent_attempts >= 15 then raise exception 'Too many attempts. Try again in 15 minutes'; end if;
  insert into public.aahat_pin_attempts(requester_id) values (caller_id);

  select p.* into target
  from public.profiles p
  where p.virtual_number = p_aahat_id
    and p.id <> caller_id
    and coalesce((p.privacy_settings->>'discover_by_aahat_id')::boolean, true)
    and not exists (
      select 1 from public.blocked_users b
      where (b.blocker_id = p.id and b.blocked_id = caller_id)
         or (b.blocker_id = caller_id and b.blocked_id = p.id)
    )
  limit 1;

  if target.id is null then raise exception 'This Aahat ID is unavailable'; end if;
  target_mode := coalesce(target.privacy_settings->>'aahat_connection_mode', 'private');
  if target_mode not in ('private', 'public') then target_mode := 'private'; end if;

  if target_mode = 'private' and (
    p_pin_code is null
    or p_pin_code !~ '^\d{6}$'
    or not exists (
      select 1 from public.aahat_credentials ac
      where ac.user_id = target.id and ac.pin_code = p_pin_code
    )
  ) then
    raise exception 'This user uses private connections. Enter their correct 6-digit PIN';
  end if;

  if exists (
    select 1 from public.user_contacts uc
    where uc.owner_id = caller_id and uc.contact_id = target.id and uc.status = 'accepted'
  ) then
    insert into public.user_contacts(owner_id, contact_id, status)
    values (target.id, caller_id, 'accepted')
    on conflict (owner_id, contact_id) do update set status = 'accepted', updated_at = now();
    direct_conversation_id := public.get_or_create_direct_conversation(caller_id, target.id);
    return query select direct_conversation_id, null::uuid, target.id, target.display_name,
      coalesce(target.avatar_url, ''), target_mode, 'accepted'::text;
    return;
  end if;

  if target_mode = 'public' then
    insert into public.user_contacts(owner_id, contact_id, status)
    values (caller_id, target.id, 'accepted'), (target.id, caller_id, 'accepted')
    on conflict (owner_id, contact_id) do update set status = 'accepted', updated_at = now();

    insert into public.contact_requests(requester_id, recipient_id, status, responded_at, updated_at)
    values (caller_id, target.id, 'accepted', now(), now())
    on conflict on constraint contact_requests_requester_id_recipient_id_key do update
      set status = 'accepted', responded_at = now(), updated_at = now()
    returning * into saved_request;

    update public.contact_requests cr
    set status = 'accepted', responded_at = now(), updated_at = now()
    where cr.requester_id = target.id and cr.recipient_id = caller_id and cr.status = 'pending';

    direct_conversation_id := public.get_or_create_direct_conversation(caller_id, target.id);
    return query select direct_conversation_id, saved_request.id, target.id, target.display_name,
      coalesce(target.avatar_url, ''), target_mode, 'accepted'::text;
    return;
  end if;

  if exists (
    select 1 from public.contact_requests cr
    where cr.requester_id = target.id and cr.recipient_id = caller_id and cr.status = 'pending'
  ) then
    raise exception 'This user already invited you. Accept their invitation in Contacts';
  end if;

  insert into public.contact_requests(requester_id, recipient_id, status, responded_at, updated_at)
  values (caller_id, target.id, 'pending', null, now())
  on conflict on constraint contact_requests_requester_id_recipient_id_key do update
    set status = 'pending', responded_at = null, updated_at = now()
  returning * into saved_request;

  return query select null::uuid, saved_request.id, target.id, target.display_name,
    case when coalesce(target.privacy_settings->>'profile_photo', 'everyone') = 'everyone'
      then coalesce(target.avatar_url, '') else '' end,
    target_mode, saved_request.status;
end;
$$;

create or replace function public.remove_contact_for_both(p_contact_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
begin
  if caller_id is null then raise exception 'Authentication required'; end if;
  if p_contact_id is null or p_contact_id = caller_id then raise exception 'Invalid contact'; end if;
  if not exists (
    select 1 from public.user_contacts uc
    where uc.owner_id = caller_id and uc.contact_id = p_contact_id and uc.status = 'accepted'
  ) then
    raise exception 'This contact is no longer connected';
  end if;

  delete from public.user_notifications un
  where un.data->>'conversation_id' in (
    select c.id::text
    from public.conversations c
    join public.conversation_members cm1 on cm1.conversation_id = c.id and cm1.user_id = caller_id
    join public.conversation_members cm2 on cm2.conversation_id = c.id and cm2.user_id = p_contact_id
    where c.type = 'direct'
  );

  delete from public.conversations c
  where c.type = 'direct'
    and exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = c.id and cm.user_id = caller_id
    )
    and exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = c.id and cm.user_id = p_contact_id
    );

  delete from public.contact_requests cr
  where (cr.requester_id = caller_id and cr.recipient_id = p_contact_id)
     or (cr.requester_id = p_contact_id and cr.recipient_id = caller_id);

  delete from public.user_contacts uc
  where (uc.owner_id = caller_id and uc.contact_id = p_contact_id)
     or (uc.owner_id = p_contact_id and uc.contact_id = caller_id);

  return true;
end;
$$;

revoke all on function public.can_view_status(uuid, uuid, text) from public;
revoke all on function public.create_aahat_status(text, text, text, text, text, uuid[]) from public;
revoke all on function public.connect_by_aahat_id(text, text) from public;
revoke all on function public.remove_contact_for_both(uuid) from public;
grant execute on function public.can_view_status(uuid, uuid, text) to authenticated;
grant execute on function public.create_aahat_status(text, text, text, text, text, uuid[]) to authenticated;
grant execute on function public.connect_by_aahat_id(text, text) to authenticated;
grant execute on function public.remove_contact_for_both(uuid) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'user_contacts'
  ) then
    alter publication supabase_realtime add table public.user_contacts;
  end if;
end $$;

commit;
