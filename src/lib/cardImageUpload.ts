const imageTypeError = "Choose a PNG, JPG, WebP or GIF image.";
const maxImageSize = 20 * 1024 * 1024;

export class CardImageReadError extends Error {
  constructor() {
    super("This photo could not be accessed. Save it to your phone, then choose it from Files.");
    this.name = "CardImageReadError";
  }
}

async function readImageBytes(file: File): Promise<ArrayBuffer> {
  const check = (buffer: ArrayBuffer) => {
    if (file.size > 0 && buffer.byteLength !== file.size) throw new CardImageReadError();
    return buffer;
  };
  try {
    if (typeof file.arrayBuffer === "function") return check(await file.arrayBuffer());
  } catch {
    // Some mobile photo providers fail the first read. Keep the picker selection
    // available while trying the full file through the older FileReader API.
  }
  try {
    if (typeof FileReader === "undefined") throw new CardImageReadError();
    const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => reader.result instanceof ArrayBuffer ? resolve(reader.result) : reject(new CardImageReadError());
      reader.onerror = reader.onabort = () => reject(new CardImageReadError());
      reader.readAsArrayBuffer(file);
    });
    return check(buffer);
  } catch {
    throw new CardImageReadError();
  }
}

export async function prepareCardImage(file: File) {
  if (file.size > maxImageSize) throw new Error("Choose an image smaller than 20 MB.");
  // Read the original file once, without slicing a phone's temporary photo URI.
  // Work from owned bytes afterwards so resetting the picker cannot revoke access.
  const buffer = await readImageBytes(file);
  if (buffer.byteLength > maxImageSize) throw new Error("Choose an image smaller than 20 MB.");
  // File pickers can report JPEGs as image/jpg, octet-stream, or no MIME type.
  // Inspect the bytes and give the browser a correctly typed Blob to decode.
  const bytes = new Uint8Array(buffer, 0, Math.min(12, buffer.byteLength));
  const startsWith = (signature: number[]) => signature.every((byte, index) => bytes[index] === byte);
  let type: string;
  if (startsWith([0xff, 0xd8, 0xff])) type = "image/jpeg";
  else if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) type = "image/png";
  else if (startsWith([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) || startsWith([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])) type = "image/gif";
  else if (startsWith([0x52, 0x49, 0x46, 0x46]) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) type = "image/webp";
  else throw new Error(imageTypeError);
  return new Blob([buffer], { type });
}
