begin;

alter table public.archive_entries
  alter column font_family set default 'cormorant';

notify pgrst, 'reload schema';

commit;
