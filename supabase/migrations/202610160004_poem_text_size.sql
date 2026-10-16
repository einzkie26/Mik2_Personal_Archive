begin;

alter table public.archive_entries
  add column if not exists poem_text_size integer not null default 100
  check (poem_text_size between 70 and 150);

notify pgrst, 'reload schema';

commit;
