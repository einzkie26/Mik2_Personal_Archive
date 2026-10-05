begin;

alter table public.archive_entries
  add column if not exists is_public boolean not null default true;
alter table public.archive_entries
  add column if not exists image_url text;
alter table public.archive_entries
  add column if not exists theme_background text not null default '#bf593f';
alter table public.archive_entries
  add column if not exists theme_ink text not null default '#fff9ee';
alter table public.archive_entries
  add column if not exists theme_accent text not null default '#f4c7a1';

create table if not exists public.archive_entry_likes (
  id uuid primary key default gen_random_uuid(),
  entry_number text not null references public.archive_entries(number) on delete cascade,
  voter_id uuid not null,
  created_at timestamptz not null default now(),
  unique (entry_number, voter_id)
);

create index if not exists archive_entry_likes_entry_idx on public.archive_entry_likes(entry_number);

create table if not exists public.archive_profile (
  id boolean primary key default true check (id),
  poet_name text not null default 'Mikhai',
  quote text not null default 'I write to notice what would otherwise pass me by.',
  bio text not null default 'I’m Mikhai, a poet and observer of ordinary wonders. My work lives somewhere between memory and morning light.',
  text_size integer not null default 100 check (text_size between 70 and 150),
  text_color text not null default '#28261f',
  updated_at timestamptz not null default now()
);

insert into public.archive_profile (id) values (true)
on conflict (id) do nothing;

alter table public.archive_entries enable row level security;
drop policy if exists archive_entries_public_read on public.archive_entries;
create policy archive_entries_public_read on public.archive_entries
  for select to anon using (is_public = true);
drop policy if exists archive_entries_owner_read on public.archive_entries;
create policy archive_entries_owner_read on public.archive_entries
  for select to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'archive_owner') = 'true');

alter table public.archive_profile enable row level security;
drop policy if exists archive_profile_public_read on public.archive_profile;
create policy archive_profile_public_read on public.archive_profile
  for select to anon, authenticated using (true);
drop policy if exists archive_profile_owner_write on public.archive_profile;
create policy archive_profile_owner_write on public.archive_profile
  for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'archive_owner') = 'true')
  with check ((auth.jwt() -> 'app_metadata' ->> 'archive_owner') = 'true');

revoke all on public.archive_profile from anon, authenticated;
grant select on public.archive_profile to anon, authenticated;
grant insert, update, delete on public.archive_profile to authenticated;

alter table public.archive_entry_likes enable row level security;
drop policy if exists archive_entry_likes_public_read on public.archive_entry_likes;
create policy archive_entry_likes_public_read on public.archive_entry_likes for select to anon, authenticated using (true);
revoke all on public.archive_entry_likes from anon, authenticated;
grant select on public.archive_entry_likes to anon, authenticated;

create or replace function public.toggle_archive_like(p_entry_number text, p_voter_id uuid, p_liked boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  next_count integer;
begin
  if not exists (select 1 from public.archive_entries where number = p_entry_number and is_public = true) then
    raise exception 'Archive entry not found';
  end if;
  if p_liked then
    insert into public.archive_entry_likes (entry_number, voter_id)
    values (p_entry_number, p_voter_id)
    on conflict (entry_number, voter_id) do nothing;
  else
    delete from public.archive_entry_likes
    where entry_number = p_entry_number and voter_id = p_voter_id;
  end if;
  select count(*)::integer into next_count from public.archive_entry_likes where entry_number = p_entry_number;
  return jsonb_build_object('liked', p_liked, 'count', next_count);
end;
$$;

revoke all on function public.toggle_archive_like(text, uuid, boolean) from public;
grant execute on function public.toggle_archive_like(text, uuid, boolean) to anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'archive_profile'
  ) then
    alter publication supabase_realtime add table public.archive_profile;
  end if;
end $$;

commit;