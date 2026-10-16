import { useRef, useState } from "react";
import type { CSSProperties } from "react";
import ArchiveDialog from "./ArchiveDialog";
import CollectionPicker from "./CollectionPicker";
import FontPicker from "./FontPicker";
import PoemSizeControl from "./PoemSizeControl";
import CardShadow from "./CardShadow";
import ShadowPicker from "./ShadowPicker";
import CardImageControls from "./CardImageControls";
import CardImageEditor, { type ImageEditRequest } from "./CardImageEditor";
import type { ArchiveEntry, EntryCategory } from "../lib/archiveTypes";
import { cardThemes, type Theme } from "../lib/cardThemes";
import { getCardFont, type CardFontId } from "../lib/cardFonts";
import { getCardShadow, type CardShadowId } from "../lib/cardShadows";
import { getPoemTextSize } from "../lib/poemTextSize";
import type { ImageCrop } from "../lib/imageCrop";

type Props = {
  entry: ArchiveEntry;
  collections: string[];
  emptyCollections: string[];
  onClose: () => void;
  onSave: (entry: ArchiveEntry) => Promise<void>;
  onDeleteCollection: (name: string) => Promise<void>;
};

type EditDraft = {
  title: string;
  author: string;
  body: string;
  category: EntryCategory;
  collection: string;
  isPublic: boolean;
  image: string;
  fontFamily: CardFontId;
  shadow: CardShadowId;
  textSize: number;
  theme: Theme;
};

export default function EditEntryDialog({ entry, collections, emptyCollections, onClose, onSave, onDeleteCollection }: Props) {
  // This component owns the edit draft. Unmounting it discards unsaved changes.
  const [draft, setDraft] = useState<EditDraft>(() => ({
    title: entry.title,
    author: entry.author || "",
    body: entry.excerpt,
    category: entry.category,
    collection: entry.collection || "Personal collection",
    isPublic: entry.is_public,
    image: entry.image_url || "",
    fontFamily: getCardFont(entry.font_family).id,
    shadow: getCardShadow(entry.shadow_overlay).id,
    textSize: getPoemTextSize(entry.poem_text_size),
    theme: {
      name: "Saved palette",
      background: entry.theme_background || cardThemes[0].background,
      ink: entry.theme_ink || cardThemes[0].ink,
      accent: entry.theme_accent || cardThemes[0].accent,
    },
  }));
  const [creatingCollection, setCreatingCollection] = useState(false);
  const [collectionStatus, setCollectionStatus] = useState("");
  const [deletingCollection, setDeletingCollection] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [imageEdit, setImageEdit] = useState<ImageEditRequest | null>(null);
  const originalImage = useRef<{ source: string; crop: ImageCrop; result: string } | null>(null);
  const { theme } = draft;
  const font = getCardFont(draft.fontFamily);
  const poemScale = draft.textSize / 100;
  const busy = saving || deletingCollection;
  const valid = Boolean(draft.body.trim() && draft.collection.trim());
  function update<K extends keyof EditDraft>(field: K, value: EditDraft[K]) {
    setDraft(current => ({ ...current, [field]: value }));
  }
  const openImageEditor = (source = draft.image) => {
    if (!source) return;
    const cached = originalImage.current;
    setImageEdit(cached?.result === source ? { source: cached.source, crop: cached.crop } : { source });
  };
  const removeCollection = async () => {
    if (busy || !emptyCollections.includes(draft.collection)) return;
    const name = draft.collection;
    setDeletingCollection(true);
    setCollectionStatus("");
    try {
      await onDeleteCollection(name);
      const remaining = collections.filter(collection => collection !== name);
      update("collection", remaining[0] || "");
      setCreatingCollection(remaining.length === 0);
      setCollectionStatus(`Deleted “${name}”.`);
    } catch (error) {
      setCollectionStatus(error instanceof Error ? error.message : "The collection could not be deleted.");
    } finally {
      setDeletingCollection(false);
    }
  };
  const save = async () => {
    if (busy || !valid || imageEdit) return;
    setSaving(true);
    setStatus("");
    try {
      await onSave({
        ...entry,
        title: draft.title.trim() || "Untitled",
        author: draft.author,
        excerpt: draft.body.trim(),
        category: draft.category,
        collection: draft.collection.trim(),
        is_public: draft.isPublic,
        image_url: draft.image || null,
        theme_background: theme.background,
        theme_ink: theme.ink,
        theme_accent: theme.accent,
        font_family: draft.fontFamily,
        shadow_overlay: draft.shadow,
        poem_text_size: draft.textSize,
        tone: draft.category === "Poem" ? "blush" : draft.category === "Prose" ? "sage" : "sand",
      });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The changes could not be saved. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return <>
    <ArchiveDialog open onClose={onClose} closeLabel="Close edit entry" ariaLabel="Edit this piece" className="edit-modal">
      <p className="eyebrow">Archive entry</p>
      <h2>Edit this piece.</h2>
      <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <div className="edit-modal-fields">
          <label>Type<select value={draft.category} onChange={event => update("category", event.target.value as EntryCategory)}><option>Poem</option><option>Prose</option><option>Note</option></select></label>
          <CollectionPicker names={collections} value={draft.collection} creatingNew={creatingCollection} onChange={(name, creating) => {
            update("collection", name);
            setCreatingCollection(creating);
            setCollectionStatus("");
          }} onDelete={!creatingCollection && emptyCollections.includes(draft.collection) ? () => void removeCollection() : undefined} deleting={deletingCollection} disabled={saving} status={collectionStatus} />
          <label>Title<input value={draft.title} onChange={event => update("title", event.target.value)} maxLength={48} /></label>
          <label>Author<input value={draft.author} onChange={event => update("author", event.target.value)} maxLength={40} /></label>
          <label className="edit-modal-wide">Text<textarea value={draft.body} onChange={event => update("body", event.target.value)} maxLength={360} rows={6} style={{ fontFamily: font.family, fontSize: `${Math.max(16, 21 * poemScale)}px` }} /></label>
          <FontPicker value={draft.fontFamily} onChange={value => update("fontFamily", value)} />
          <label>Visibility<select value={draft.isPublic ? "public" : "hidden"} onChange={event => update("isPublic", event.target.value === "public")}><option value="public">Public</option><option value="hidden">Hidden</option></select></label>
          <div className="edit-modal-wide"><PoemSizeControl value={draft.textSize} onChange={value => update("textSize", value)} /></div>
          <div className="edit-modal-wide"><CardImageControls value={draft.image} disabled={busy} onChoose={openImageEditor} onEdit={() => openImageEditor()} onRemove={() => {
            update("image", "");
            originalImage.current = null;
          }} /></div>
        </div>
        <div className="edit-modal-palette">
          <p className="eyebrow">Palette</p>
          <div className="theme-options">{cardThemes.map(option => {
            const active = option.background === theme.background && option.ink === theme.ink && option.accent === theme.accent;
            return <button type="button" className={active ? "active" : ""} key={option.name} onClick={() => update("theme", option)} style={active ? { backgroundColor: option.background, color: option.ink, borderColor: option.accent } : undefined} aria-pressed={active}>{option.name}</button>;
          })}</div>
          <div className={`edit-style-preview${draft.image ? " has-card-image" : ""}`} style={{
            backgroundColor: theme.background, color: theme.ink, borderColor: theme.accent, fontFamily: font.family,
            "--quote-image-color": theme.background,
            "--quote-image": draft.image ? `url(${JSON.stringify(draft.image)})` : undefined,
          } as CSSProperties}><CardShadow value={draft.shadow} /><strong>{draft.title || "Untitled"}</strong><p style={{ fontSize: `${20 * poemScale}px` }}>{draft.body || "Your words will appear here."}</p></div>
        </div>
        <ShadowPicker value={draft.shadow} onChange={value => update("shadow", value)} />
      </fieldset>
      <button type="button" className="profile-save-button" onClick={() => void save()} disabled={busy || !valid || imageEdit !== null}>{saving ? "Saving…" : "Save changes"}</button>
      {status && <p className="studio-share-feedback" role="alert">{status}</p>}
    </ArchiveDialog>
    <CardImageEditor image={imageEdit} background={theme.background} onClose={() => setImageEdit(null)} onApply={(source, crop, result) => {
      originalImage.current = { source, crop, result };
      update("image", result);
      setImageEdit(null);
    }} />
  </>;
}
