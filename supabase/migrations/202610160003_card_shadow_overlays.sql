begin;

alter table public.archive_entries
  add column if not exists shadow_overlay text not null default 'none'
  check (shadow_overlay in ('none', 'window', 'blinds', 'diagonal', 'palm', 'leaves', 'arch', 'lattice', 'soft-shade'));

notify pgrst, 'reload schema';

commit;
