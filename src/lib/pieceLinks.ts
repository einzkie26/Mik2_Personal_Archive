export function piecePath(number: string) {
  return `/piece/${encodeURIComponent(number)}`;
}

export function pieceNumberFromPath(pathname: string) {
  const match = /^\/piece\/([^/]+)\/?$/.exec(pathname);
  if (!match) return null;
  try {
    const number = decodeURIComponent(match[1]);
    return number.length > 0 && number.length <= 64 && !/[\u0000-\u001f\u007f/]/.test(number) ? number : null;
  } catch {
    return null;
  }
}

export function pieceUrl(number: string, origin: string) {
  return new URL(piecePath(number), origin).href;
}

export function pieceImagePath(number: string, version?: string) {
  const pathname = `${piecePath(number)}/image.png`;
  return version ? `${pathname}?v=${encodeURIComponent(version)}` : pathname;
}

export function pieceDescription(text: string, limit = 220) {
  const normalized = text.replace(/\s+/gu, " ").trim();
  const characters = Array.from(normalized);
  return characters.length > limit ? `${characters.slice(0, limit - 1).join("").trimEnd()}…` : normalized;
}
