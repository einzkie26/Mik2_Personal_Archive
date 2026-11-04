import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { ArchiveProfile } from "../lib/archiveTypes";
import ArchiveDialog from "./ArchiveDialog";
import PoetSection from "./PoetSection";

type Props = {
  profile: ArchiveProfile;
  onClose: () => void;
  onSave: (profile: ArchiveProfile) => Promise<void>;
};

export default function ArchiveSettingsDialog({ profile, onClose, onSave }: Props) {
  // Keep edits local so closing the modal restores the saved poet section.
  const [draft, setDraft] = useState(profile);
  const [volume, setVolume] = useState(String(profile.volume));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [previousView] = useState(() => ({
    left: window.scrollX,
    top: window.scrollY,
    trigger: document.activeElement instanceof HTMLElement ? document.activeElement : null,
  }));
  useEffect(() => () => {
    previousView.trigger?.focus({ preventScroll: true });
    window.scrollTo({ left: previousView.left, top: previousView.top, behavior: "instant" });
  }, [previousView]);
  const volumeNumber = Number(volume);
  const volumeValid = Number.isInteger(volumeNumber) && volumeNumber >= 1 && volumeNumber <= 9999;
  const volumeLabel = volumeValid ? volumeNumber : profile.volume;
  function update<K extends keyof ArchiveProfile>(field: K, value: ArchiveProfile[K]) {
    setDraft(current => ({ ...current, [field]: value }));
    setError("");
  }
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving || !volumeValid) return;
    setSaving(true);
    setError("");
    try {
      await onSave({ ...draft, volume: volumeNumber });
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The archive settings could not be saved. Please try again.");
      setSaving(false);
    }
  };

  return <ArchiveDialog open onClose={onClose} closeOnBackdrop={!saving} onCancel={event => {
    event.preventDefault();
    if (!saving) onClose();
  }} ariaLabel="Archive settings" className="poet-settings-modal">
    <div className="poet-settings-layout">
      <form className="archive-settings-card poet-settings-form" onSubmit={event => void save(event)} aria-busy={saving}>
        <div className="poet-settings-heading">
          <p className="eyebrow">Archive settings</p>
          <button type="button" className="poet-settings-close" aria-label="Close archive settings" disabled={saving} onClick={onClose}>×</button>
        </div>
        <h2>Make it <em>yours.</em></h2>
        <p className="archive-settings-intro">Edit your archive details and see your poet section update in the preview.</p>
        <div className="poet-settings-fields">
        <fieldset className="poet-settings-fieldset" disabled={saving}>
          <legend className="sr-only">Archive details and poet profile</legend>
          <div className="archive-settings-fields">
            <div className="archive-setting-field"><label>Archive volume<input type="number" min="1" max="9999" step="1" inputMode="numeric" value={volume} onChange={event => { setVolume(event.target.value); setError(""); }} aria-invalid={!volumeValid} aria-describedby="archive-volume-help" /></label><small id="archive-volume-help">Shown as “Personal archive · VOL {volumeLabel}” in Quiet hours.</small></div>
            <label>Poet name<input value={draft.poet_name} onChange={event => update("poet_name", event.target.value)} maxLength={40} /></label>
            <label>Poet quote<textarea value={draft.quote} onChange={event => update("quote", event.target.value)} maxLength={180} rows={3} /></label>
            <label>Poet biography<textarea value={draft.bio} onChange={event => update("bio", event.target.value)} maxLength={360} rows={4} /></label>
            <div className="profile-controls">
              <label>Poet quote size<input type="range" min="70" max="150" value={draft.text_size} onChange={event => update("text_size", Number(event.target.value))} aria-valuetext={`${draft.text_size} percent`} /><output>{draft.text_size}%</output></label>
              <label>Quote color<input type="color" value={draft.text_color} onChange={event => update("text_color", event.target.value)} /></label>
            </div>
          </div>
        </fieldset>
        </div>
        {error && <p className="poet-settings-error" role="alert">{error}</p>}
        <div className="poet-settings-footer">
          <button type="button" className="poet-settings-cancel" disabled={saving} onClick={onClose}>Cancel</button>
          <button type="submit" className="profile-save-button" disabled={saving || !volumeValid}>{saving ? "Saving…" : "Save all"}</button>
        </div>
      </form>
      <aside className="poet-settings-preview-column" aria-label="Poet preview">
        <p className="poet-preview-label"><span aria-hidden="true" />Live preview</p>
        <PoetSection profile={{ ...draft, volume: volumeLabel }} preview />
      </aside>
    </div>
  </ArchiveDialog>;
}
