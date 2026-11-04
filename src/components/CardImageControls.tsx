import { useRef, useState } from "react";
import { prepareCardImage } from "../lib/cardImageUpload";

type Props = {
  value: string;
  disabled?: boolean;
  onChoose: (source: string) => void;
  onEdit: () => void;
  onRemove: () => void;
};

export default function CardImageControls({ value, disabled, onChoose, onEdit, onRemove }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const chooseFile = async (file?: File) => {
    if (!file) return;
    setError("");
    setLoading(true);
    try {
      const image = await prepareCardImage(file);
      const source = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("The image could not be read. Please try another file."));
        reader.readAsDataURL(image);
      });
      onChoose(source);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The image could not be read.");
    } finally {
      setLoading(false);
    }
  };
  return <div className="card-image-controls">
    <p className="card-image-label">Background image</p>
    <input ref={inputRef} type="file" accept=".png,.jpg,.jpeg,.webp,.gif,image/png,image/jpeg,image/webp,image/gif" disabled={disabled || loading} hidden aria-label="Choose background image" onChange={event => {
      const file = event.target.files?.[0];
      event.target.value = "";
      void chooseFile(file);
    }} />
    <div className="card-image-actions">
      <button type="button" disabled={disabled || loading} onClick={() => inputRef.current?.click()}>{loading ? "Reading image…" : value ? "Replace image" : "Upload image"}</button>
      {value && <>
        <button type="button" disabled={disabled || loading} onClick={onEdit}>Adjust crop</button>
        <button type="button" className="card-image-remove" disabled={disabled || loading} onClick={() => { setError(""); onRemove(); }}>Remove image</button>
      </>}
    </div>
    <p className="card-image-help">Crop, zoom and position before applying. PNG transparency is preserved. Up to 20 MB.</p>
    {error && <p className="card-image-error" role="alert">{error}</p>}
  </div>;
}
