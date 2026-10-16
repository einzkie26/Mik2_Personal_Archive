import { useEffect, useRef } from "react";
import type { MouseEvent, PointerEvent, ReactEventHandler, ReactNode } from "react";

type Props = {
  open: boolean;
  onClose?: () => void;
  onCancel?: ReactEventHandler<HTMLDialogElement>;
  closeOnBackdrop?: boolean;
  closeLabel?: string;
  className?: string;
  ariaLabel?: string;
  children: ReactNode;
};

export default function ArchiveDialog({
  open, onClose, onCancel, closeOnBackdrop = true, closeLabel, className = "", ariaLabel, children,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pointerStartedOnBackdrop = useRef(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!open) {
      if (dialog.open) dialog.close();
      return;
    }

    const viewport = window.visualViewport;
    const updateViewport = () => {
      const height = viewport?.height ?? window.innerHeight;
      const top = viewport?.offsetTop ?? 0;
      dialog.style.setProperty("--dialog-viewport-height", `${height}px`);
      dialog.style.setProperty("--dialog-viewport-top", `${top}px`);
      dialog.style.setProperty("--dialog-viewport-bottom", `${Math.max(0, window.innerHeight - top - height)}px`);
    };
    updateViewport();
    if (!dialog.open) {
      dialog.showModal();
      dialog.querySelector(".archive-dialog-content")?.scrollTo(0, 0);
    }
    viewport?.addEventListener("resize", updateViewport);
    viewport?.addEventListener("scroll", updateViewport);
    window.addEventListener("resize", updateViewport);
    return () => {
      viewport?.removeEventListener("resize", updateViewport);
      viewport?.removeEventListener("scroll", updateViewport);
      window.removeEventListener("resize", updateViewport);
    };
  }, [open]);

  const isBackdrop = (event: MouseEvent<HTMLDialogElement> | PointerEvent<HTMLDialogElement>) => {
    if (event.target !== event.currentTarget) return false;
    const bounds = event.currentTarget.getBoundingClientRect();
    return event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom;
  };

  return <dialog
    ref={dialogRef}
    className={`poem-reader archive-dialog ${closeLabel ? "has-close-button " : ""}${className}`}
    aria-label={ariaLabel}
    onClose={() => { if (open) onClose?.(); }}
    onCancel={onCancel}
    onPointerDown={(event) => { pointerStartedOnBackdrop.current = isBackdrop(event); }}
    onPointerCancel={() => { pointerStartedOnBackdrop.current = false; }}
    onClick={(event) => {
      if (closeOnBackdrop && pointerStartedOnBackdrop.current && isBackdrop(event)) event.currentTarget.close();
      pointerStartedOnBackdrop.current = false;
    }}
  >
    {closeLabel && <div className="archive-dialog-header">
      <button type="button" className="reader-close" onClick={() => dialogRef.current?.close()} aria-label={closeLabel}>×</button>
    </div>}
    <div className="archive-dialog-content">{children}</div>
  </dialog>;
}
