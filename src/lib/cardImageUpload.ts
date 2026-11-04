const imageTypeError = "Choose a PNG, JPG, WebP or GIF image.";

export async function prepareCardImage(file: File) {
  if (file.size > 20 * 1024 * 1024) throw new Error("Choose an image smaller than 20 MB.");
  // File pickers can report JPEGs as image/jpg, octet-stream, or no MIME type.
  // Inspect the bytes and give the browser a correctly typed Blob to decode.
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const startsWith = (signature: number[]) => signature.every((byte, index) => bytes[index] === byte);
  let type: string;
  if (startsWith([0xff, 0xd8, 0xff])) type = "image/jpeg";
  else if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) type = "image/png";
  else if (startsWith([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) || startsWith([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])) type = "image/gif";
  else if (startsWith([0x52, 0x49, 0x46, 0x46]) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) type = "image/webp";
  else throw new Error(imageTypeError);
  return file.slice(0, file.size, type);
}
