begin;

-- Keep required text while allowing pieces of any word or character count.
alter table public.archive_entries
  drop constraint if exists archive_entries_excerpt_check;
alter table public.archive_entries
  add constraint archive_entries_excerpt_check check (length(btrim(excerpt)) > 0);

commit;
