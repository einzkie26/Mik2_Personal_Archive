import type { ArchiveProfile } from "../lib/archiveTypes";

type Props = {
  profile: ArchiveProfile;
  settingsOpen?: boolean;
  onOpenSettings?: () => void;
  status?: string;
};

export default function PoetSection({ profile, settingsOpen = false, onOpenSettings, status }: Props) {
  const scale = profile.text_size / 100;
  return <section className={`about${settingsOpen ? " is-selected is-highlighted" : ""}`} id="about" aria-label="The poet">
    {onOpenSettings && <button type="button" className="poet-settings-toggle" aria-label="Open archive settings" aria-haspopup="dialog" aria-expanded={settingsOpen} disabled={settingsOpen} title="Archive settings" onClick={event => {
      event.currentTarget.focus({ preventScroll: true });
      onOpenSettings();
    }}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.7 6.3a5 5 0 0 0-6.4 6.4L3.6 17.4a2.1 2.1 0 0 0 3 3l4.7-4.7a5 5 0 0 0 6.4-6.4l-3.3 3.3-3-3 3.3-3.3Z" /></svg>
    </button>}
    <div className="about-mark" aria-hidden="true">“</div>
    <blockquote style={{
      color: profile.text_color.toLowerCase() === "#28261f" ? "var(--archive-ink)" : profile.text_color,
      fontSize: `clamp(${2.5 * scale}rem, ${4 * scale}vw, ${4.5 * scale}rem)`,
    }}>{profile.quote || "Your quote will appear here."}</blockquote>
    <div className="about-copy">
      <p className="eyebrow">The poet</p>
      <p>{profile.bio.replace("Mikhai", profile.poet_name) || "Your biography will appear here."}</p>
    </div>
    {status && <p className="poet-profile-status" role="status">{status}</p>}
  </section>;
}
