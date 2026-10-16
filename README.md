# Mik2_Personal_Archive
The Poetry Archives for Mikhai is here, can do poetry, share some notes and dares anything from people and environment

Apply the SQL files in `supabase/migrations` in filename order using the Supabase SQL Editor. Existing installations need `202610090001_archive_volume.sql` before an owner can save the archive volume. It defaults existing profiles to volume 1 and keeps the profile's existing owner permissions.

Apply `202610160001_card_fonts.sql` to save poem font choices with archive entries. Existing pieces default to Fraunces. The archive remains readable before this update; saving another font requires the migration. Empty collection deletion uses the existing collection foreign key, which prevents deleting collections that contain pieces.
