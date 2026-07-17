-- Secure Aahat ID + PIN contact invitations.
-- A direct conversation can only be created after the recipient accepts.


create table if not exists public.user_contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  contact_id uuid not null references public.profiles(id) on delete cascade,
  nickname text,
  status text not null default 'accepted' check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, contact_id)
);

create table if not exists public.contact_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'cancelled')),
  message text not null default '',
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(requester_id, recipient_id)
);

create index if not exists idx_user_contacts_owner
  on public.user_contacts(owner_id, status, created_at desc);
create index if not exists idx_user_contacts_contact
  on public.user_contacts(contact_id, status, created_at desc);
create index if not exists idx_contact_requests_recipient
  on public.contact_requests(recipient_id, status, created_at desc);
create index if not exists idx_contact_requests_requester
  on public.contact_requests(requester_id, status, created_at desc);
create table if not exists public.aahat_credentials (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  pin_code text not null check (pin_code ~ '^\d{6}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.aahat_pin_attempts (
  id bigint generated always as identity primary key,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  attempted_at timestamptz not null default now()
);

create index if not exists idx_aahat_pin_attempts_requester
  on public.aahat_pin_attempts(requester_id, attempted_at desc);

alter table public.user_contacts enable row level security;
alter table public.contact_requests enable row level security;

drop policy if exists "user_contacts_owner_select" on public.user_contacts;
create policy "user_contacts_owner_select" on public.user_contacts
  for select to authenticated using (owner_id = auth.uid());

revoke all on public.user_contacts from anon, authenticated;
grant select on public.user_contacts to authenticated;

alter table public.aahat_credentials enable row level security;
alter table public.aahat_pin_attempts enable row level security;

drop policy if exists "aahat_credentials_owner_select" on public.aahat_credentials;
create policy "aahat_credentials_owner_select" on public.aahat_credentials
  for select to authenticated using (user_id = auth.uid());

revoke all on public.aahat_credentials from anon, authenticated;
grant select on public.aahat_credentials to authenticated;
revoke all on public.aahat_pin_attempts from anon, authenticated;

create or replace function public.generate_aahat_pin()
returns text
language sql
volatile
set search_path = public
as $$
  select lpad(floor(random() * 1000000)::text, 6, '0');
$$;

insert into public.aahat_credentials(user_id, pin_code)
select p.id, public.generate_aahat_pin()
from public.profiles p
on conflict (user_id) do nothing;

create or replace function public.ensure_aahat_credentials()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.aahat_credentials(user_id, pin_code)
  values (new.id, public.generate_aahat_pin())
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_ensure_aahat_credentials on public.profiles;
create trigger trg_ensure_aahat_credentials
after insert on public.profiles
for each row execute function public.ensure_aahat_credentials();

create or replace function public.get_my_aahat_credentials()
returns table (aahat_id text, pin_code text)
language sql
security definer
set search_path = public
as $$
  select p.virtual_number, c.pin_code
  from public.profiles p
  join public.aahat_credentials c on c.user_id = p.id
  where p.id = auth.uid();
$$;

create or replace function public.rotate_my_aahat_pin()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  next_pin text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  next_pin := public.generate_aahat_pin();
  insert into public.aahat_credentials(user_id, pin_code, updated_at)
  values (auth.uid(), next_pin, now())
  on conflict (user_id) do update
    set pin_code = excluded.pin_code, updated_at = now();
  return next_pin;
end;
$$;

-- Direct conversations are only available to mutually accepted contacts.
create or replace function public.get_or_create_direct_conversation(
  user1_id uuid,
  user2_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  conv_id uuid;
  accepted_edges integer;
begin
  if auth.uid() is null or auth.uid() not in (user1_id, user2_id) then
    raise exception 'Access denied';
  end if;
  if user1_id = user2_id then
    raise exception 'Use the self conversation for your own account';
  end if;

  select count(*) into accepted_edges
  from public.user_contacts uc
  where uc.status = 'accepted'
    and ((uc.owner_id = user1_id and uc.contact_id = user2_id)
      or (uc.owner_id = user2_id and uc.contact_id = user1_id));

  if accepted_edges < 2 then
    raise exception 'Contact invitation must be accepted first';
  end if;

  select c.id into conv_id
  from public.conversations c
  join public.conversation_members cm1 on cm1.conversation_id = c.id and cm1.user_id = user1_id
  join public.conversation_members cm2 on cm2.conversation_id = c.id and cm2.user_id = user2_id
  where c.type = 'direct'
  limit 1;

  if conv_id is not null then return conv_id; end if;

  insert into public.conversations(type, created_by)
  values ('direct', auth.uid()) returning id into conv_id;

  insert into public.conversation_members(conversation_id, user_id, role)
  values (conv_id, user1_id, 'member'), (conv_id, user2_id, 'member');
  return conv_id;
end;
$$;

create or replace function public.request_contact_by_aahat_credentials(
  p_aahat_id text,
  p_pin_code text
) returns table (
  request_id uuid,
  recipient_id uuid,
  display_name text,
  avatar_url text,
  request_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.profiles%rowtype;
  saved_request public.contact_requests%rowtype;
  recent_attempts integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_aahat_id !~ '^\d{10}$' or p_pin_code !~ '^\d{6}$' then
    raise exception 'Enter a valid 10-digit Aahat ID and 6-digit PIN';
  end if;

  delete from public.aahat_pin_attempts where attempted_at < now() - interval '1 day';
  select count(*) into recent_attempts
  from public.aahat_pin_attempts
  where requester_id = auth.uid() and attempted_at > now() - interval '15 minutes';
  if recent_attempts >= 10 then
    raise exception 'Too many attempts. Try again in 15 minutes';
  end if;
  insert into public.aahat_pin_attempts(requester_id) values (auth.uid());

  select p.* into target
  from public.profiles p
  join public.aahat_credentials c on c.user_id = p.id
  where p.virtual_number = p_aahat_id
    and c.pin_code = p_pin_code
    and p.id <> auth.uid()
    and coalesce((p.privacy_settings->>'discover_by_aahat_id')::boolean, true)
    and not exists (
      select 1 from public.blocked_users b
      where (b.blocker_id = p.id and b.blocked_id = auth.uid())
         or (b.blocker_id = auth.uid() and b.blocked_id = p.id)
    )
  limit 1;

  if target.id is null then
    raise exception 'Aahat ID or PIN is incorrect, or this user is unavailable';
  end if;

  if exists (
    select 1 from public.user_contacts
    where user_contacts.owner_id = auth.uid()
      and user_contacts.contact_id = target.id
      and user_contacts.status = 'accepted'
  ) then
    raise exception 'This user is already in your contacts';
  end if;

  if exists (
    select 1 from public.contact_requests
    where contact_requests.requester_id = target.id
      and contact_requests.recipient_id = auth.uid()
      and contact_requests.status = 'pending'
  ) then
    raise exception 'This user already invited you. Accept their invitation in Contacts';
  end if;

  insert into public.contact_requests(requester_id, recipient_id, status, responded_at, updated_at)
  values (auth.uid(), target.id, 'pending', null, now())
  on conflict on constraint contact_requests_requester_id_recipient_id_key do update
    set status = 'pending', responded_at = null, updated_at = now()
  returning * into saved_request;

  return query select saved_request.id, target.id, target.display_name,
    case when coalesce(target.privacy_settings->>'profile_photo', 'everyone') = 'everyone'
      then target.avatar_url else '' end,
    saved_request.status;
end;
$$;

create or replace function public.respond_to_contact_request(
  p_request_id uuid,
  p_accept boolean
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  pending_request public.contact_requests%rowtype;
  conv_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into pending_request
  from public.contact_requests
  where id = p_request_id and recipient_id = auth.uid() and status = 'pending'
  for update;
  if pending_request.id is null then raise exception 'Invitation is no longer available'; end if;

  update public.contact_requests
  set status = case when p_accept then 'accepted' else 'rejected' end,
      responded_at = now(), updated_at = now()
  where id = pending_request.id;

  if not p_accept then return null; end if;

  insert into public.user_contacts(owner_id, contact_id, status)
  values
    (pending_request.requester_id, pending_request.recipient_id, 'accepted'),
    (pending_request.recipient_id, pending_request.requester_id, 'accepted')
  on conflict (owner_id, contact_id) do update
    set status = 'accepted', updated_at = now();

  conv_id := public.get_or_create_direct_conversation(
    pending_request.requester_id,
    pending_request.recipient_id
  );
  return conv_id;
end;
$$;

drop policy if exists "contact_requests_participants" on public.contact_requests;
drop policy if exists "contact_requests_participant_select" on public.contact_requests;
create policy "contact_requests_participant_select" on public.contact_requests
  for select to authenticated
  using (requester_id = auth.uid() or recipient_id = auth.uid());

revoke insert, update, delete on public.contact_requests from authenticated;
grant select on public.contact_requests to authenticated;

revoke all on function public.generate_aahat_pin() from public;
revoke all on function public.get_my_aahat_credentials() from public;
revoke all on function public.rotate_my_aahat_pin() from public;
revoke all on function public.request_contact_by_aahat_credentials(text, text) from public;
revoke all on function public.respond_to_contact_request(uuid, boolean) from public;
grant execute on function public.get_my_aahat_credentials() to authenticated;
grant execute on function public.rotate_my_aahat_pin() to authenticated;
grant execute on function public.request_contact_by_aahat_credentials(text, text) to authenticated;
grant execute on function public.respond_to_contact_request(uuid, boolean) to authenticated;
grant execute on function public.get_or_create_direct_conversation(uuid, uuid) to authenticated;

-- Keep Aahat IDs stable and close direct table-write bypasses. Conversation
-- creation and membership insertion must go through the guarded RPCs.
create or replace function public.prevent_aahat_id_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.virtual_number is distinct from old.virtual_number then
    raise exception 'Aahat ID cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_aahat_id_change on public.profiles;
create trigger trg_prevent_aahat_id_change
before update of virtual_number on public.profiles
for each row execute function public.prevent_aahat_id_change();

revoke insert on public.conversations from authenticated;
revoke insert on public.conversation_members from authenticated;
revoke all on function public.prevent_aahat_id_change() from public;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'contact_requests'
  ) then
    alter publication supabase_realtime add table public.contact_requests;
  end if;
end $$;
