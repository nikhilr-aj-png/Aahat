begin;

create or replace function public.create_public_channel(
  p_name text,
  p_description text default '',
  p_avatar_url text default ''
)
returns public.channels
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  clean_name text := btrim(coalesce(p_name, ''));
  created_channel public.channels;
begin
  if caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if char_length(clean_name) < 2 or char_length(clean_name) > 80 then
    raise exception 'Channel name must be between 2 and 80 characters' using errcode = '22023';
  end if;
  if char_length(coalesce(p_description, '')) > 500 then
    raise exception 'Channel description must be 500 characters or fewer' using errcode = '22023';
  end if;

  insert into public.channels (name, description, avatar_url, created_by, type, subscriber_count)
  values (clean_name, btrim(coalesce(p_description, '')), coalesce(p_avatar_url, ''), caller_id, 'public', 0)
  returning * into created_channel;

  insert into public.channel_members (channel_id, user_id, role)
  values (created_channel.id, caller_id, 'admin');

  select * into created_channel from public.channels where id = created_channel.id;
  return created_channel;
end;
$$;

revoke all on function public.create_public_channel(text, text, text) from public;
grant execute on function public.create_public_channel(text, text, text) to authenticated;

-- Repair channels created by the former two-query client flow.
insert into public.channel_members (channel_id, user_id, role)
select c.id, c.created_by, 'admin'
from public.channels c
where not exists (
  select 1 from public.channel_members cm
  where cm.channel_id = c.id and cm.user_id = c.created_by
)
on conflict (channel_id, user_id) do update set role = 'admin';

update public.channels c
set subscriber_count = (
  select count(*) from public.channel_members cm where cm.channel_id = c.id
)
where c.subscriber_count is distinct from (
  select count(*) from public.channel_members cm where cm.channel_id = c.id
);

commit;