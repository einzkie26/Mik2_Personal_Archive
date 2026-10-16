export type ImageCrop = { zoom: number; x: number; y: number };

export const defaultImageCrop: ImageCrop = { zoom: 1, x: 0, y: 0 };

export function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

// The preview and PNG use the same square coordinates, including transparent margins.
export function getImageCropLayout(width: number, height: number, crop: ImageCrop, size = 1) {
  if (![width, height, size].every(value => Number.isFinite(value) && value > 0)) {
    throw new Error("The image has invalid dimensions.");
  }
  const zoom = Number.isFinite(crop.zoom) ? clamp(crop.zoom, 0.000001, 4) : 1;
  const scale = size / Math.min(width, height) * zoom;
  const drawWidth = width * scale;
  const drawHeight = height * scale;
  const limitX = Math.abs(size - drawWidth) / 2;
  const limitY = Math.abs(size - drawHeight) / 2;
  return {
    width: drawWidth,
    height: drawHeight,
    left: (size - drawWidth) / 2 + limitX * clamp(crop.x || 0, -1, 1),
    top: (size - drawHeight) / 2 + limitY * clamp(crop.y || 0, -1, 1),
    limitX,
    limitY,
  };
}

export async function renderImageCrop(image: HTMLImageElement, crop: ImageCrop) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1080;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Your browser could not prepare the image.");
  const layout = getImageCropLayout(image.naturalWidth, image.naturalHeight, crop, canvas.width);
  context.imageSmoothingQuality = "high";
  // Leave the canvas clear so transparent uploads and Fit margins retain their alpha.
  context.drawImage(image, layout.left, layout.top, layout.width, layout.height);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(result => result ? resolve(result) : reject(new Error("The crop could not be created.")), "image/png");
  });
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("The crop could not be read."));
    reader.readAsDataURL(blob);
  });
}
