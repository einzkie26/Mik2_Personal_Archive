# Mik2_Personal_Archive
The Poetry Archives for Mikhai is here, can do poetry, share some notes and dares anything from people and environment

Card Studio and the entry editor accept unlimited text and show live word, paragraph, and sentence counts. Blank lines separate paragraphs. Apply `supabase/migrations/202611040001_unlimited_entry_text.sql` before deploying this update to remove the database's former 360-character limit. Preview in archive shows the unsaved draft in the actual archive grid with the same card layout used after saving. Back to Card Studio keeps the draft and restores the previous archive filters. Submit saves the piece to the archive; Instagram sharing remains available in the reader.

Apply the SQL files in `supabase/migrations` in filename order using the Supabase SQL Editor. Existing installations need archive_volume before an owner can save the archive volume. It defaults existing profiles to volume 1 and keeps the profile's existing owner permissions.

Apply card_fonts to save poem font choices with archive entries, then `202610160002_default_poem_font.sql` to use the archive's original Cormorant Garamond as the database default for new pieces. The archive remains readable before these updates; saving another font requires the card fonts migration. Empty collection deletion uses the existing collection foreign key, which prevents deleting collections that contain pieces.

Apply card_shadow_overlays.sql to save shadow overlay choices with entries. The default is `none`; previews and exported images share the same shadow artwork. Before this migration, pieces without an overlay can still be saved.

Apply `202610160004_poem_text_size.sql` to save each poem's text size (70–150%, default 100%). This controls poem text in the editor, card preview, reader, and exported image; long poems shrink to fit exports. Archive settings open from the owner's wrench at the top right of The Poet section. The settings panel selects the actual Poet section for live edits while preserving its typography and layout. On phones, the panel sits below the selected section. Close or Cancel discards edits; Save all saves the profile and closes the modal.
