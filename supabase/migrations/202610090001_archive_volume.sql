begin;

alter table public.archive_profile
  add column if not exists volume integer not null default 1;

alter table public.archive_profile
  alter column volume set default 1;

update public.archive_profile set volume = 1 where volume is null;

alter table public.archive_profile
  alter column volume set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.archive_profile'::regclass
      and conname = 'archive_profile_volume_check'
  ) then
    alter table public.archive_profile
      add constraint archive_profile_volume_check check (volume between 1 and 9999);
  end if;
end $$;

create index if not exists archive_entries_created_at_idx
  on public.archive_entries(created_at desc);

commit;
