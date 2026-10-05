begin;

create table if not exists public.kv_store_9db47b9e (
  key text not null primary key,
  value jsonb not null
);

create table if not exists public.archive_collections (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(btrim(name)) between 1 and 80),
  created_at timestamptz not null default now()
);

create table if not exists public.archive_entries (
  number text primary key check (length(number) between 1 and 64),
  title text not null check (length(btrim(title)) between 1 and 48),
  excerpt text not null check (length(btrim(excerpt)) between 1 and 360),
  category text not null check (category in ('Poem', 'Prose', 'Note')),
  date text not null,
  tone text not null check (tone in ('blush', 'sage', 'sand')),
  author text not null default 'Mikhai' check (length(author) <= 40),
  collection_id uuid not null references public.archive_collections(id),
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.archive_entries add column if not exists is_public boolean not null default true;

create table if not exists public.archive_profile (
  id boolean primary key default true check (id),
  poet_name text not null default 'Mikhai',
  quote text not null default 'I write to notice what would otherwise pass me by.',
  bio text not null default 'I’m Mikhai, a poet and observer of ordinary wonders. My work lives somewhere between memory and morning light.',
  text_size integer not null default 100 check (text_size between 70 and 150),
  text_color text not null default '#28261f',
  updated_at timestamptz not null default now()
);

insert into public.archive_profile (id) values (true) on conflict (id) do nothing;

create index if not exists archive_entries_updated_at_idx on public.archive_entries(updated_at desc);
create index if not exists archive_entries_collection_idx on public.archive_entries(collection_id);

alter table public.archive_entries enable row level security;
alter table public.archive_collections enable row level security;

drop policy if exists archive_entries_public_read on public.archive_entries;
create policy archive_entries_public_read on public.archive_entries for select to anon using (is_public = true);
drop policy if exists archive_entries_owner_read on public.archive_entries;
create policy archive_entries_owner_read on public.archive_entries for select to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'archive_owner') = 'true');
drop policy if exists archive_entries_owner_write on public.archive_entries;
create policy archive_entries_owner_write on public.archive_entries for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'archive_owner') = 'true')
  with check ((auth.jwt() -> 'app_metadata' ->> 'archive_owner') = 'true');
drop policy if exists archive_collections_public_read on public.archive_collections;
create policy archive_collections_public_read on public.archive_collections for select to anon, authenticated using (true);
drop policy if exists archive_collections_owner_write on public.archive_collections;
create policy archive_collections_owner_write on public.archive_collections for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'archive_owner') = 'true')
  with check ((auth.jwt() -> 'app_metadata' ->> 'archive_owner') = 'true');

alter table public.archive_profile enable row level security;
drop policy if exists archive_profile_public_read on public.archive_profile;
create policy archive_profile_public_read on public.archive_profile for select to anon, authenticated using (true);
drop policy if exists archive_profile_owner_write on public.archive_profile;
create policy archive_profile_owner_write on public.archive_profile for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'archive_owner') = 'true')
  with check ((auth.jwt() -> 'app_metadata' ->> 'archive_owner') = 'true');

revoke all on public.archive_entries, public.archive_collections, public.archive_profile from anon, authenticated;
grant select on public.archive_entries, public.archive_collections, public.archive_profile to anon, authenticated;
grant insert, update, delete on public.archive_entries, public.archive_collections, public.archive_profile to authenticated;

insert into public.archive_collections (name) values ('Quiet hours'), ('Passing places'), ('Small reminders') on conflict (name) do nothing;

insert into public.archive_entries (number, title, excerpt, category, date, tone, author, collection_id, updated_at)
select seed.number, seed.title, seed.excerpt, seed.category, seed.date, seed.tone, 'Mikhai', collection.id, seed.published_at::timestamptz
from (values
  ('01', 'The light we leave on', 'At dusk, every window becomes a small promise—the kind we make without words, hoping someone finds their way home.', 'Poem', 'May 18, 2025', 'blush', 'Quiet hours', '2025-05-18'),
  ('02', 'Notes from the train', 'The countryside kept unfolding outside the glass, green and unbothered. I thought about all the places that only exist while passing through.', 'Prose', 'May 03, 2025', 'sage', 'Passing places', '2025-05-03'),
  ('03', 'A small reminder', E'I carry my mother’s laughter\nlike a matchbook—\nbright, brief, always enough.', 'Note', 'April 26, 2025', 'sand', 'Small reminders', '2025-04-26')
) as seed(number, title, excerpt, category, date, tone, collection_name, published_at)
join public.archive_collections collection on collection.name = seed.collection_name
on conflict (number) do nothing;

insert into public.archive_collections (name)
select distinct coalesce(nullif(btrim(value ->> 'collection'), ''), 'Personal collection')
from public.kv_store_9db47b9e where key like 'archive-entry:%'
on conflict (name) do nothing;

insert into public.archive_entries (number, title, excerpt, category, date, tone, author, collection_id)
select legacy.value ->> 'number', legacy.value ->> 'title', legacy.value ->> 'excerpt', legacy.value ->> 'category',
  coalesce(legacy.value ->> 'date', to_char(now(), 'Mon DD, YYYY')), legacy.value ->> 'tone',
  coalesce(legacy.value ->> 'author', 'Mikhai'), collection.id
from public.kv_store_9db47b9e legacy
join public.archive_collections collection on collection.name = coalesce(nullif(btrim(legacy.value ->> 'collection'), ''), 'Personal collection')
where legacy.key like 'archive-entry:%'
on conflict (number) do nothing;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'archive_entries') then
    alter publication supabase_realtime add table public.archive_entries;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'archive_collections') then
    alter publication supabase_realtime add table public.archive_collections;
  end if;
end $$;

commit;
