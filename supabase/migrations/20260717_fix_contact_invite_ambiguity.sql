-- Qualify contact-request columns that collide with RETURNS TABLE output names.
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
  from public.aahat_pin_attempts apa
  where apa.requester_id = auth.uid() and apa.attempted_at > now() - interval '15 minutes';
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
    select 1 from public.user_contacts uc
    where uc.owner_id = auth.uid()
      and uc.contact_id = target.id
      and uc.status = 'accepted'
  ) then
    raise exception 'This user is already in your contacts';
  end if;

  if exists (
    select 1 from public.contact_requests cr
    where cr.requester_id = target.id
      and cr.recipient_id = auth.uid()
      and cr.status = 'pending'
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

revoke all on function public.request_contact_by_aahat_credentials(text, text) from public;
grant execute on function public.request_contact_by_aahat_credentials(text, text) to authenticated;
