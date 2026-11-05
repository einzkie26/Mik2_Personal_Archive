import type { ArchiveEntry } from "../lib/archiveTypes";
import { getCardFont } from "../lib/cardFonts";
import { getPoemTextSize } from "../lib/poemTextSize";
import CardShadow from "./CardShadow";
import CardBackgroundImage from "./CardBackgroundImage";
import { piecePath } from "../lib/pieceLinks";
import type { MouseEvent } from "react";

type Props = {
  entry: ArchiveEntry;
  isOwner: boolean;
  liked?: boolean;
  deleting?: boolean;
  preview?: boolean;
  onRead: () => void;
  onLike?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
};

export default function ArchiveCard({ entry, isOwner, liked = false, deleting = false, preview = false, onRead, onLike, onEdit, onDelete }: Props) {
  const font = getCardFont(entry.font_family);
  const scale = getPoemTextSize(entry.poem_text_size) / 100;
  const href = piecePath(entry.number);
  const readLink = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onRead();
  };
  const panelClass = `quote-panel ${entry.tone}${entry.image_url ? " has-card-image" : ""}`;
  const panelStyle = { backgroundColor: entry.theme_background, color: entry.theme_ink };
  const artwork = <>
    <CardBackgroundImage source={entry.image_url} />
    <span aria-hidden="true">“</span>
    <CardShadow value={entry.shadow_overlay} />
    <blockquote style={{ fontFamily: font.family, fontSize: `${25 * scale}px`, color: entry.theme_ink }}>{entry.excerpt}</blockquote>
  </>;
  return <article className={`poem-card${preview ? " is-archive-preview" : ""}`} id={preview ? "archive-draft-preview" : undefined} aria-label={preview ? `Unsaved preview of ${entry.title}` : undefined} onClick={event => {
    if ((event.target as HTMLElement).closest("button, a")) return;
    onRead();
  }}>
    {preview ? <div className={panelClass} style={panelStyle}>{artwork}</div> : <a className={panelClass} style={panelStyle} href={href} onClick={readLink} aria-label={`Open ${entry.title}`}>{artwork}</a>}
    <div className="entry-content">
      <div className="poem-meta"><span>{entry.category}</span><span>{entry.date}</span></div>
      <h3 style={{ fontFamily: font.family }}>{preview ? entry.title : <a href={href} onClick={readLink}>{entry.title}</a>}</h3>
      {entry.collection && <span className="entry-collection">From {entry.collection}</span>}
      <p style={{ fontFamily: font.family, fontSize: `${17 * scale}px` }}>{entry.excerpt}</p>
      <div className="entry-actions">
        <button type="button" className={`favorite-button ${liked ? "is-liked" : ""}`} aria-label={`${liked ? "Unlike" : "Like"} ${entry.title}`} aria-pressed={liked} disabled={preview} onClick={onLike}><svg viewBox="0 0 24 24" fill={liked ? "currentColor" : "none"} aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" /></svg><span>{entry.likes}</span></button>
        {preview ? <button type="button" aria-label={`Read ${entry.title}`} onClick={onRead}>Read piece <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h11M11 6l4 4-4 4" /></svg></button> : <a href={href} aria-label={`Read ${entry.title}`} onClick={readLink}>Read piece <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h11M11 6l4 4-4 4" /></svg></a>}
        {isOwner && <>
          <button type="button" className="entry-edit-button" aria-label={`Edit ${entry.title}`} disabled={preview} onClick={onEdit}>Edit</button>
          <button type="button" className="entry-delete-button" aria-label={`Delete ${entry.title}`} disabled={preview || deleting} onClick={onDelete}>{deleting ? "Deleting…" : "Delete"}</button>
        </>}
      </div>
    </div>
  </article>;
}
