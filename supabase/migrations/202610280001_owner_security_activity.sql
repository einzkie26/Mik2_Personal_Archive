begin;

-- Only the login Edge Function can authorize a CAPTCHA-verified Auth session.
create table public.archive_owner_sessions (
  session_id uuid primary key references auth.sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  verified_at timestamptz not null default now()
);
alter table public.archive_owner_sessions enable row level security;
revoke all on public.archive_owner_sessions from public, anon, authenticated;
grant all on public.archive_owner_sessions to service_role;

create or replace function public.archive_owner_has_access()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.archive_owner_sessions verified
    join auth.sessions session on session.id = verified.session_id and session.user_id = verified.user_id
    join auth.users owner on owner.id = verified.user_id
    where verified.user_id = auth.uid()
      and verified.session_id::text = (auth.jwt() ->> 'session_id')
      and owner.raw_app_meta_data ->> 'archive_owner' = 'true'
  );
$$;
revoke all on function public.archive_owner_has_access() from public, anon;
grant execute on function public.archive_owner_has_access() to authenticated;

create table public.archive_activity_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event text not null check (event ~ '^[a-z_]{1,64}$'),
  outcome text not null check (outcome in ('success', 'failure', 'blocked')),
  actor_id uuid,
  summary text not null check (length(summary) between 1 and 200),
  resource_label text check (length(resource_label) <= 160)
);
create index archive_activity_logs_created_idx on public.archive_activity_logs(created_at desc, id desc);
alter table public.archive_activity_logs enable row level security;
revoke all on public.archive_activity_logs from public, anon, authenticated;
grant select on public.archive_activity_logs to authenticated;
grant all on public.archive_activity_logs to service_role;
create policy archive_activity_logs_owner_read on public.archive_activity_logs
  for select to authenticated using ((select public.archive_owner_has_access()));

-- Shared, atomic limits across Edge Function instances. Keys are salted hashes;
-- neither email addresses nor IP addresses are stored.
create table public.archive_login_limits (
  key text primary key check (key ~ '^(ip|email):[a-f0-9]{64}$'),
  window_started_at timestamptz not null,
  attempts integer not null check (attempts > 0)
);
alter table public.archive_login_limits enable row level security;
revoke all on public.archive_login_limits from public, anon, authenticated;
grant all on public.archive_login_limits to service_role;

create function public.archive_reserve_login_attempt(p_keys text[])
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  bucket timestamptz := date_bin(interval '10 minutes', now(), timestamptz '2026-01-01');
  limit_key text;
  attempt_count integer;
  max_attempts integer;
  allowed boolean := true;
  should_log boolean := false;
begin
  if coalesce(array_length(p_keys, 1), 0) not between 1 and 2
    or exists (select 1 from unnest(p_keys) value where value is null or value !~ '^(ip|email):[a-f0-9]{64}$') then
    raise exception 'Invalid rate limit keys';
  end if;
  delete from public.archive_login_limits where window_started_at < now() - interval '1 day';
  -- A consistent lock order prevents concurrent requests from deadlocking.
  for limit_key in select unnest(p_keys) order by 1 loop
    insert into public.archive_login_limits as limits (key, window_started_at, attempts)
    values (limit_key, bucket, 1)
    on conflict (key) do update set
      attempts = case when limits.window_started_at = bucket then limits.attempts + 1 else 1 end,
      window_started_at = bucket
    returning attempts into attempt_count;
    max_attempts := case when limit_key like 'ip:%' then 30 else 10 end;
    if attempt_count > max_attempts then allowed := false; end if;
    if attempt_count = max_attempts + 1 then should_log := true; end if;
  end loop;
  return jsonb_build_object('allowed', allowed, 'should_log', should_log,
    'retry_after', greatest(1, ceil(extract(epoch from bucket + interval '10 minutes' - now()))::integer));
end;
$$;
revoke all on function public.archive_reserve_login_attempt(text[]) from public, anon, authenticated;
grant execute on function public.archive_reserve_login_attempt(text[]) to service_role;

create function public.archive_complete_owner_login(p_session_id uuid, p_user_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from auth.sessions session join auth.users owner on owner.id = session.user_id
    where session.id = p_session_id and owner.id = p_user_id
      and owner.raw_app_meta_data ->> 'archive_owner' = 'true'
  ) then raise exception 'Owner session required'; end if;
  insert into public.archive_owner_sessions(session_id, user_id) values (p_session_id, p_user_id);
  insert into public.archive_activity_logs(event, outcome, actor_id, summary)
    values ('owner_signed_in', 'success', p_user_id, 'Owner signed in with a verified security check.');
end;
$$;
revoke all on function public.archive_complete_owner_login(uuid, uuid) from public, anon, authenticated;
grant execute on function public.archive_complete_owner_login(uuid, uuid) to service_role;

create function public.archive_end_owner_session()
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not public.archive_owner_has_access() then raise exception 'Owner session required'; end if;
  delete from public.archive_owner_sessions
    where session_id::text = (auth.jwt() ->> 'session_id') and user_id = auth.uid();
  insert into public.archive_activity_logs(event, outcome, actor_id, summary)
    values ('owner_signed_out', 'success', auth.uid(), 'Owner signed out of the archive.');
end;
$$;
revoke all on function public.archive_end_owner_session() from public, anon;
grant execute on function public.archive_end_owner_session() to authenticated;

-- Enforce the CAPTCHA at the database boundary, including direct REST requests.
drop policy if exists archive_entries_owner_read on public.archive_entries;
create policy archive_entries_owner_read on public.archive_entries for select to authenticated
  using ((select public.archive_owner_has_access()));
drop policy if exists archive_entries_owner_write on public.archive_entries;
create policy archive_entries_owner_write on public.archive_entries for all to authenticated
  using ((select public.archive_owner_has_access())) with check ((select public.archive_owner_has_access()));
drop policy if exists archive_collections_owner_write on public.archive_collections;
create policy archive_collections_owner_write on public.archive_collections for all to authenticated
  using ((select public.archive_owner_has_access())) with check ((select public.archive_owner_has_access()));
drop policy if exists archive_profile_owner_write on public.archive_profile;
create policy archive_profile_owner_write on public.archive_profile for all to authenticated
  using ((select public.archive_owner_has_access())) with check ((select public.archive_owner_has_access()));

-- A signed-in visitor can continue reading the public archive while reauthenticating.
drop policy if exists archive_entries_public_read on public.archive_entries;
create policy archive_entries_public_read on public.archive_entries for select to anon, authenticated using (is_public);

create function public.archive_log_content_change()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  row_data jsonb;
  event_name text;
  action_summary text;
  label text;
begin
  if auth.uid() is null then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  if tg_op = 'UPDATE' and (to_jsonb(new) - 'updated_at') = (to_jsonb(old) - 'updated_at') then return new; end if;
  if tg_op = 'DELETE' then row_data := to_jsonb(old); else row_data := to_jsonb(new); end if;
  if tg_table_name = 'archive_entries' then
    event_name := 'entry_' || case tg_op when 'INSERT' then 'created' when 'UPDATE' then 'updated' else 'deleted' end;
    action_summary := case tg_op when 'INSERT' then 'Created a piece.' when 'UPDATE' then 'Updated a piece.' else 'Deleted a piece.' end;
    label := row_data ->> 'title';
  elsif tg_table_name = 'archive_collections' then
    event_name := 'collection_' || case tg_op when 'INSERT' then 'created' when 'UPDATE' then 'updated' else 'deleted' end;
    action_summary := case tg_op when 'INSERT' then 'Created a collection.' when 'UPDATE' then 'Updated a collection.' else 'Deleted a collection.' end;
    label := row_data ->> 'name';
  else
    event_name := 'profile_updated';
    action_summary := 'Updated archive settings.';
  end if;
  insert into public.archive_activity_logs(event, outcome, actor_id, summary, resource_label)
    values (event_name, 'success', auth.uid(), action_summary, left(label, 160));
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;
revoke all on function public.archive_log_content_change() from public, anon, authenticated;
create trigger archive_entries_activity after insert or update or delete on public.archive_entries
  for each row execute function public.archive_log_content_change();
create trigger archive_collections_activity after insert or update or delete on public.archive_collections
  for each row execute function public.archive_log_content_change();
create trigger archive_profile_activity after insert or update or delete on public.archive_profile
  for each row execute function public.archive_log_content_change();

create function public.archive_log_password_change()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.encrypted_password is distinct from old.encrypted_password
    and new.raw_app_meta_data ->> 'archive_owner' = 'true' then
    insert into public.archive_activity_logs(event, outcome, actor_id, summary)
      values ('password_changed', 'success', new.id, 'Owner password changed.');
  end if;
  return new;
end;
$$;
revoke all on function public.archive_log_password_change() from public, anon, authenticated;
create trigger archive_owner_password_activity after update of encrypted_password on auth.users
  for each row execute function public.archive_log_password_change();

commit;
