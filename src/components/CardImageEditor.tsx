import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import ArchiveDialog from "./ArchiveDialog";
import { clamp, defaultImageCrop, getImageCropLayout, renderImageCrop, type ImageCrop } from "../lib/imageCrop";

export type ImageEditRequest = { source: string; crop?: ImageCrop };
type Props = {
  image: ImageEditRequest | null;
  background: string;
  onClose: () => void;
  onApply: (source: string, crop: ImageCrop, result: string) => void;
};

export default function CardImageEditor({ image, background, onClose, onApply }: Props) {
  const [crop, setCrop] = useState<ImageCrop>(defaultImageCrop);
  const [loaded, setLoaded] = useState<HTMLImageElement | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const drag = useRef<{ id: number; x: number; y: number; crop: ImageCrop; limitX: number; limitY: number } | null>(null);
  const request = useRef(image);
  request.current = image;

  useEffect(() => {
    setCrop(image?.crop || defaultImageCrop);
    setLoaded(null);
    setError("");
    setSaving(false);
    drag.current = null;
    if (!image) return;
    let cancelled = false;
    const artwork = new Image();
    artwork.onload = () => {
      if (cancelled) return;
      if (!artwork.naturalWidth || !artwork.naturalHeight) setError("This image has no usable size. Please choose another file.");
      else setLoaded(artwork);
    };
    artwork.onerror = () => { if (!cancelled) setError("This image could not be opened. Please choose another file."); };
    artwork.src = image.source;
    return () => { cancelled = true; };
  }, [image]);

  const layout = loaded ? getImageCropLayout(loaded.naturalWidth, loaded.naturalHeight, crop) : null;
  const fitZoom = loaded ? Math.min(loaded.naturalWidth, loaded.naturalHeight) / Math.max(loaded.naturalWidth, loaded.naturalHeight) : 1;
  const minZoom = Math.min(.25, fitZoom);
  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!loaded || saving || event.button !== 0 || !event.isPrimary) return;
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    const current = getImageCropLayout(loaded.naturalWidth, loaded.naturalHeight, crop, bounds.width);
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, crop, limitX: current.limitX, limitY: current.limitY };
  };
  const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (!start || start.id !== event.pointerId) return;
    setCrop({
      ...start.crop,
      x: start.limitX > .01 ? clamp(start.crop.x + (event.clientX - start.x) / start.limitX, -1, 1) : 0,
      y: start.limitY > .01 ? clamp(start.crop.y + (event.clientY - start.y) / start.limitY, -1, 1) : 0,
    });
  };
  const apply = async () => {
    if (!loaded || !image || saving) return;
    const current = image;
    setSaving(true);
    setError("");
    try {
      const result = await renderImageCrop(loaded, crop);
      if (request.current === current) onApply(current.source, crop, result);
    } catch {
      if (request.current === current) setError("This crop could not be created. Please try another image.");
    } finally {
      if (request.current === current) setSaving(false);
    }
  };

  return <ArchiveDialog open={image !== null} onClose={onClose} closeLabel="Close image editor" ariaLabel="Crop and position image" className="image-editor-modal">
    <p className="eyebrow">Background image</p>
    <h2>Make it your frame.</h2>
    <p className="image-editor-intro">Drag the image to position it, then zoom to choose what appears on your card.</p>
    <div className="image-editor-workspace">
    <div>
    <div className="image-editor-frame" role="group" aria-label="Image crop preview. Drag or use arrow keys to reposition." tabIndex={loaded && !saving ? 0 : -1}
      style={{ backgroundColor: background }}
      onPointerDown={startDrag} onPointerMove={moveDrag}
      onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}
      onKeyDown={event => {
        if (!loaded || saving || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
        event.preventDefault();
        const step = event.shiftKey ? .2 : .05;
        setCrop(current => ({ ...current, x: clamp(current.x + (event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0), -1, 1), y: clamp(current.y + (event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0), -1, 1) }));
      }}>
      {loaded && layout ? <>
        <img src={loaded.src} alt="" draggable={false} style={{ width: `${layout.width * 100}%`, height: `${layout.height * 100}%`, left: `${layout.left * 100}%`, top: `${layout.top * 100}%` }} />
        <span className="image-editor-grid" aria-hidden="true" />
      </> : <span className="image-editor-loading" role="status">{error ? "Preview unavailable" : "Loading image…"}</span>}
    </div>
    <p className="image-editor-caption">Square crop · 1080 × 1080. Artwork is softened over your palette on the finished card.</p>
    </div>
    <div>
    <div className="image-editor-presets">
      <button type="button" disabled={!loaded || saving} onClick={() => setCrop(defaultImageCrop)}>Fill card</button>
      <button type="button" disabled={!loaded || saving} onClick={() => setCrop({ zoom: fitZoom, x: 0, y: 0 })}>Fit image</button>
      <button type="button" disabled={!loaded || saving} onClick={() => setCrop(image?.crop || defaultImageCrop)}>Reset changes</button>
    </div>
    <div className="image-editor-sliders">
      <label>Zoom <output>{Math.round(crop.zoom * 100)}%</output><input aria-label="Image zoom" type="range" min={minZoom} max="4" step=".01" value={crop.zoom} disabled={!loaded || saving} onChange={event => setCrop(current => ({ ...current, zoom: Number(event.target.value) }))} /></label>
      <label>Horizontal position<input aria-label="Horizontal image position" type="range" min="-100" max="100" step="1" value={Math.round(crop.x * 100)} disabled={!layout || layout.limitX < .0001 || saving} onChange={event => setCrop(current => ({ ...current, x: Number(event.target.value) / 100 }))} /></label>
      <label>Vertical position<input aria-label="Vertical image position" type="range" min="-100" max="100" step="1" value={Math.round(crop.y * 100)} disabled={!layout || layout.limitY < .0001 || saving} onChange={event => setCrop(current => ({ ...current, y: Number(event.target.value) / 100 }))} /></label>
    </div>
    </div>
    </div>
    {error && <p className="card-image-error" role="alert">{error}</p>}
    <div className="image-editor-footer">
      <button type="button" className="image-editor-cancel" disabled={saving} onClick={onClose}>Cancel</button>
      <button type="button" className="image-editor-apply" disabled={!loaded || saving} onClick={() => void apply()}>{saving ? "Applying…" : "Use crop"}</button>
    </div>
  </ArchiveDialog>;
}
