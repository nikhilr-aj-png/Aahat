begin;

create or replace function public.block_and_remove_contact(p_contact_id uuid)
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
    where uc.owner_id = caller_id
      and uc.contact_id = p_contact_id
      and uc.status = 'accepted'
  ) then
    raise exception 'This contact is no longer connected';
  end if;

  insert into public.blocked_users(blocker_id, blocked_id)
  values (caller_id, p_contact_id)
  on conflict (blocker_id, blocked_id) do nothing;

  perform public.remove_contact_for_both(p_contact_id);
  return true;
end;
$$;

-- Keep the existing, battle-tested connection transaction internal and expose
-- a privacy-safe facade. Private targets never return their name or avatar to
-- the requester before they have accepted the invitation.
create or replace function public.connect_by_aahat_id_private_safe(
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
language sql
security definer
set search_path = public
as $$
  select
    result.conversation_id,
    result.request_id,
    result.recipient_id,
    case when result.connection_mode = 'private' then 'Aahat' else result.display_name end,
    case when result.connection_mode = 'private' then '/logo.png' else result.avatar_url end,
    result.connection_mode,
    result.request_status
  from public.connect_by_aahat_id(p_aahat_id, p_pin_code) result;
$$;

create or replace function public.search_profile_by_aahat_id(p_aahat_id text)
returns table (
  id uuid,
  virtual_number text,
  display_name text,
  avatar_url text,
  bio text
)
language sql
stable
security definer
set search_path = public
as $$
  with candidate as (
    select
      p.*,
      coalesce(p.privacy_settings->>'aahat_connection_mode', 'private') as connection_mode,
      exists (
        select 1 from public.user_contacts uc
        where uc.owner_id = auth.uid()
          and uc.contact_id = p.id
          and uc.status = 'accepted'
      ) as is_connected
    from public.profiles p
    where p.virtual_number = p_aahat_id
      and p.id <> auth.uid()
      and coalesce((p.privacy_settings->>'discover_by_aahat_id')::boolean, true)
      and not exists (
        select 1 from public.blocked_users b
        where (b.blocker_id = p.id and b.blocked_id = auth.uid())
           or (b.blocker_id = auth.uid() and b.blocked_id = p.id)
      )
    limit 1
  )
  select
    c.id,
    c.virtual_number,
    case when c.connection_mode = 'public' or c.is_connected then c.display_name else 'Aahat' end,
    case
      when c.connection_mode <> 'public' and not c.is_connected then '/logo.png'
      when coalesce(c.privacy_settings->>'profile_photo', 'everyone') = 'everyone' or c.is_connected
        then coalesce(c.avatar_url, '')
      else ''
    end,
    case when c.connection_mode = 'public' or c.is_connected then coalesce(c.bio, '') else '' end
  from candidate c;
$$;

revoke all on function public.block_and_remove_contact(uuid) from public;
revoke all on function public.connect_by_aahat_id(text, text) from public;
revoke all on function public.connect_by_aahat_id(text, text) from anon, authenticated;
revoke all on function public.connect_by_aahat_id_private_safe(text, text) from public;
revoke all on function public.search_profile_by_aahat_id(text) from public;

grant execute on function public.block_and_remove_contact(uuid) to authenticated;
grant execute on function public.connect_by_aahat_id_private_safe(text, text) to authenticated;
grant execute on function public.search_profile_by_aahat_id(text) to authenticated;

notify pgrst, 'reload schema';

commit;
