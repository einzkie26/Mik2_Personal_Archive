import { useEffect, useLayoutEffect, useState } from "react";
import type { FormEvent } from "react";
import type { ArchiveProfile } from "../lib/archiveTypes";
import ArchiveDialog from "./ArchiveDialog";

type Props = {
  profile: ArchiveProfile;
  onClose: () => void;
  onSave: (profile: ArchiveProfile) => Promise<void>;
  onPreview: (profile: ArchiveProfile) => void;
};

export default function ArchiveSettingsDialog({ profile, onClose, onSave, onPreview }: Props) {
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
  useEffect(() => {
    onPreview({ ...draft, volume: volumeLabel });
  }, [draft, volumeLabel, onPreview]);

  useLayoutEffect(() => {
    const section = document.getElementById("about");
    const slot = section?.parentElement;
    if (!section || !slot) return;
    // Select the original DOM section and fit it beside the panel without
    // changing its typography, content layout, or place in the document.
    slot.style.setProperty("--poet-section-height", `${section.offsetHeight}px`);
    slot.classList.add("is-selecting");
    const viewport = window.visualViewport;
    const positionSelection = () => {
      const viewportWidth = viewport?.width ?? window.innerWidth;
      const viewportHeight = viewport?.height ?? window.innerHeight;
      const viewportLeft = viewport?.offsetLeft ?? 0;
      const viewportTop = viewport?.offsetTop ?? 0;
      const width = slot.clientWidth;
      section.style.setProperty("--poet-selection-width", `${width}px`);
      section.classList.add("is-selection-positioned");
      const height = section.offsetHeight;
      const narrow = viewportWidth <= 900;
      const panelWidth = Math.min(360, viewportWidth * .32);
      const areaLeft = viewportLeft + (narrow ? 16 : panelWidth + 48);
      const areaTop = viewportTop + 16;
      const areaWidth = Math.max(1, viewportWidth - (narrow ? 32 : panelWidth + 72));
      const areaHeight = Math.max(1, narrow ? viewportHeight * .5 - 40 : viewportHeight - 32);
      const scale = Math.min(1, areaWidth / width, areaHeight / height);
      section.style.setProperty("--poet-selection-scale", String(scale));
      section.style.setProperty("--poet-selection-left", `${areaLeft + (areaWidth - width * scale) / 2}px`);
      section.style.setProperty("--poet-selection-top", `${areaTop + (areaHeight - height * scale) / 2}px`);
    };
    positionSelection();
    const observer = new ResizeObserver(positionSelection);
    observer.observe(section);
    window.addEventListener("resize", positionSelection);
    viewport?.addEventListener("resize", positionSelection);
    viewport?.addEventListener("scroll", positionSelection);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", positionSelection);
      viewport?.removeEventListener("resize", positionSelection);
      viewport?.removeEventListener("scroll", positionSelection);
      section.classList.remove("is-selection-positioned");
      for (const name of ["width", "scale", "left", "top"]) section.style.removeProperty(`--poet-selection-${name}`);
      slot.classList.remove("is-selecting");
      slot.style.removeProperty("--poet-section-height");
    };
  }, []);
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

  return <>
  <div className="poet-settings-scrim" aria-hidden="true" />
  <ArchiveDialog open onClose={onClose} closeOnBackdrop={!saving} onCancel={event => {
    event.preventDefault();
    if (!saving) onClose();
  }} ariaLabel="Archive settings" className="poet-settings-modal">
      <form className="archive-settings-card poet-settings-form" onSubmit={event => void save(event)} aria-busy={saving}>
        <div className="poet-settings-heading">
          <p className="eyebrow">Archive settings</p>
          <button type="button" className="poet-settings-close" aria-label="Close archive settings" disabled={saving} onClick={onClose}>×</button>
        </div>
        <h2>Make it <em>yours.</em></h2>
        <p className="archive-settings-intro">Changes appear directly in the selected poet section.</p>
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
  </ArchiveDialog>
  </>;
}
