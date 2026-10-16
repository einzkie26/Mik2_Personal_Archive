# Mik2_Personal_Archive
The Poetry Archives for Mikhai is here, can do poetry, share some notes and dares anything from people and environment

Apply the SQL files in `supabase/migrations` in filename order using the Supabase SQL Editor. Existing installations need archive_volume before an owner can save the archive volume. It defaults existing profiles to volume 1 and keeps the profile's existing owner permissions.

Apply card_fonts to save poem font choices with archive entries, then `202610160002_default_poem_font.sql` to use the archive's original Cormorant Garamond as the database default for new pieces. The archive remains readable before these updates; saving another font requires the card fonts migration. Empty collection deletion uses the existing collection foreign key, which prevents deleting collections that contain pieces.

Apply card_shadow_overlays.sql to save shadow overlay choices with entries. The default is `none`; previews and exported images share the same shadow artwork. Before this migration, pieces without an overlay can still be saved.

Apply `202610160004_poem_text_size.sql` to save each poem's text size (70–150%, default 100%). This controls poem text in the editor, card preview, reader, and exported image; long poems shrink to fit exports. Archive settings have their own card and save action.
