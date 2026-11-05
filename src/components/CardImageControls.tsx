import { useRef, useState } from "react";
import { CardImageReadError, prepareCardImage } from "../lib/cardImageUpload";

const imageAccept = ".png,.jpg,.jpeg,.webp,.gif,image/png,image/jpeg,image/webp,image/gif";

type Props = {
  value: string;
  disabled?: boolean;
  onChoose: (source: string) => void;
  onEdit: () => void;
  onRemove: () => void;
};

export default function CardImageControls({ value, disabled, onChoose, onEdit, onRemove }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const reading = useRef(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const openPicker = (fromFiles = false) => {
    const input = inputRef.current;
    if (!input || disabled || reading.current) return;
    // An unfiltered picker offers Files when a mobile gallery cannot grant access.
    // The selected bytes are still validated before opening the crop editor.
    input.accept = fromFiles ? "" : imageAccept;
    input.click();
  };
  const chooseFile = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    if (!file || reading.current) return;
    reading.current = true;
    setError(null);
    setLoading(true);
    try {
      const image = await prepareCardImage(file);
      const source = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        const failed = () => reject(new Error("Your browser could not prepare this image. Please try a smaller photo."));
        reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : failed();
        reader.onerror = reader.onabort = failed;
        reader.readAsDataURL(image);
      });
      if (input.isConnected) onChoose(source);
    } catch (reason) {
      if (input.isConnected) setError(reason instanceof Error ? reason : new CardImageReadError());
    } finally {
      // Keep the selection until all bytes have been copied. Clearing it earlier
      // can invalidate a mobile gallery's temporary access to the picked file.
      input.value = "";
      reading.current = false;
      if (input.isConnected) setLoading(false);
    }
  };
  return <div className="card-image-controls" aria-busy={loading}>
    <p className="card-image-label">Background image</p>
    <input ref={inputRef} type="file" accept={imageAccept} disabled={disabled || loading} hidden aria-label="Choose background image" onChange={event => void chooseFile(event.currentTarget)} />
    <div className="card-image-actions">
      <button type="button" disabled={disabled || loading} onClick={() => openPicker()}>{loading ? "Reading image…" : value ? "Replace image" : "Upload image"}</button>
      {error instanceof CardImageReadError && <button type="button" disabled={disabled || loading} onClick={() => openPicker(true)}>Choose from Files</button>}
      {value && <>
        <button type="button" disabled={disabled || loading} onClick={onEdit}>Adjust crop</button>
        <button type="button" className="card-image-remove" disabled={disabled || loading} onClick={() => { setError(null); onRemove(); }}>Remove image</button>
      </>}
    </div>
    <p className="card-image-help">Crop, zoom and position before applying. PNG transparency is preserved. Up to 20 MB.</p>
    {error && <p className="card-image-error" role="alert">{error.message}</p>}
  </div>;
}
