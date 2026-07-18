begin;

create extension if not exists pg_net with schema extensions;

create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique,
  provider text not null default 'fcm' check (provider = 'fcm'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.push_tokens enable row level security;

alter table public.user_notifications
  add column if not exists push_dispatched_at timestamptz;

create index if not exists push_tokens_user_active_idx
  on public.push_tokens(user_id, is_active);

drop policy if exists "push_tokens_select_own" on public.push_tokens;
create policy "push_tokens_select_own" on public.push_tokens
for select to authenticated using (user_id = auth.uid());

drop policy if exists "push_tokens_delete_own" on public.push_tokens;
create policy "push_tokens_delete_own" on public.push_tokens
for delete to authenticated using (user_id = auth.uid());

create or replace function public.register_push_token(p_token text, p_provider text default 'fcm')
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if nullif(trim(p_token), '') is null then raise exception 'Push token is required'; end if;
  if p_provider <> 'fcm' then raise exception 'Unsupported push provider'; end if;

  delete from public.push_tokens where token = p_token and user_id <> auth.uid();
  insert into public.push_tokens(user_id, token, provider, is_active, updated_at)
  values (auth.uid(), p_token, p_provider, true, now())
  on conflict (token) do update
    set user_id = excluded.user_id,
        provider = excluded.provider,
        is_active = true,
        updated_at = now();
end;
$$;

revoke all on function public.register_push_token(text,text) from public;
grant execute on function public.register_push_token(text,text) to authenticated;

create or replace function public.dispatch_message_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.type <> 'message' then return new; end if;

  perform net.http_post(
    url := 'https://jxyobyinvflojrhrdcrf.supabase.co/functions/v1/send-message-push',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('notification_id', new.id),
    timeout_milliseconds := 5000
  );
  return new;
end;
$$;
drop trigger if exists trg_dispatch_message_push on public.user_notifications;
create trigger trg_dispatch_message_push
after insert on public.user_notifications
for each row execute function public.dispatch_message_push();

commit;
