begin;

alter table public.archive_entries
  add column if not exists font_family text not null default 'fraunces'
  check (font_family in ('fraunces', 'cormorant', 'instrument', 'lora', 'playfair', 'dm-sans', 'space-mono', 'caveat', 'georgia', 'palatino'));

notify pgrst, 'reload schema';

commit;
