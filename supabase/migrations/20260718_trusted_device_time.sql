begin;

-- This minimal public clock endpoint lets the signed-out app verify the device
-- clock before mounting auth or any private application data.
create or replace function public.get_trusted_server_time()
returns timestamptz
language sql
volatile
security invoker
set search_path = pg_catalog
as $$
  select clock_timestamp();
$$;

revoke all on function public.get_trusted_server_time() from public;
grant execute on function public.get_trusted_server_time() to anon, authenticated;

commit;
