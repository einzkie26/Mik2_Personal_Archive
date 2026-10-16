const leaf = (x: number, y: number, angle: number, length: number, width: number) =>
  `<path d="M0 0 C${length * .3} ${-width},${length * .8} ${-width},${length} 0 C${length * .8} ${width},${length * .3} ${width},0 0Z" transform="translate(${x} ${y}) rotate(${angle})"/>`;

const palm = `<path d="M1070 -80 Q760 340 420 1140" fill="none" stroke-width="10"/>${Array.from({ length: 15 }, (_, index) => {
  const x = 1010 - index * 37, y = -20 + index * 70;
  return leaf(x, y, 182 + index * 2, 440 - index * 14, 19) + leaf(x, y, 57 + index * 2, 390 - index * 12, 17);
}).join("")}`;

const leaves = `<path d="M-70 1150 Q260 560 1000 30" fill="none" stroke-width="12"/>${Array.from({ length: 9 }, (_, index) => {
  const x = 60 + index * 103, y = 990 - index * 108;
  return leaf(x, y, -112 + index * 3, 185 + index % 3 * 28, 53) + leaf(x, y, 20 - index * 2, 210 - index % 3 * 18, 56);
}).join("")}`;

export const cardShadows = [
  { id: "none", name: "None", blur: 0, opacity: 0, shapes: "" },
  { id: "window", name: "Window", blur: 5, opacity: .34, shapes: '<g transform="rotate(-14 540 540)"><path fill-rule="evenodd" d="M-500-500H1600V1600H-500Z M180 80H510V470H180Z M555 80H885V470H555Z M180 515H510V905H180Z M555 515H885V905H555Z"/></g>' },
  { id: "blinds", name: "Blinds", blur: 3, opacity: .32, shapes: `<g transform="rotate(-17 540 540)">${Array.from({ length: 14 }, (_, index) => `<rect x="-400" y="${-260 + index * 119}" width="1900" height="39"/>`).join("")}<rect x="890" y="-400" width="55" height="1900"/></g>` },
  { id: "diagonal", name: "Diagonal", blur: 7, opacity: .32, shapes: '<g transform="rotate(-32 540 540)"><rect x="-500" y="-120" width="2100" height="205"/><rect x="-500" y="350" width="2100" height="115"/><rect x="-500" y="820" width="2100" height="210"/></g>' },
  { id: "palm", name: "Palm", blur: 5, opacity: .32, shapes: palm },
  { id: "leaves", name: "Leaves", blur: 9, opacity: .30, shapes: leaves },
  { id: "arch", name: "Arch", blur: 6, opacity: .34, shapes: '<g transform="rotate(-12 540 540)"><path fill-rule="evenodd" d="M-500-500H1600V1600H-500Z M230 1400V400A310 310 0 0 1 850 400V1400Z"/><path d="M540 90V1400M220 510H860M220 880H860" fill="none" stroke-width="32"/></g>' },
  { id: "lattice", name: "Lattice", blur: 4, opacity: .28, shapes: `<g transform="rotate(-28 540 540)">${Array.from({ length: 7 }, (_, index) => `<rect x="${-400 + index * 280}" y="-500" width="45" height="2100"/><rect x="-500" y="${-400 + index * 280}" width="2100" height="45"/>`).join("")}</g>` },
  { id: "soft-shade", name: "Soft shade", blur: 25, opacity: .32, shapes: '<path d="M-200-200H1400V420L-200 1050Z"/><path d="M720 1400H1400V760Z"/>' },
] as const;

export type CardShadowId = typeof cardShadows[number]["id"];
const sources = new Map<CardShadowId, string>();

export function getCardShadow(id?: string) {
  return cardShadows.find((shadow) => shadow.id === id) || cardShadows[0];
}

export function getCardShadowSource(id?: string) {
  const shadow = getCardShadow(id);
  if (shadow.id === "none") return undefined;
  let source = sources.get(shadow.id);
  if (!source) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080"><defs><filter id="soft" x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="${shadow.blur}"/></filter></defs><g fill="#0b0c0c" stroke="#0b0c0c" opacity="${shadow.opacity}" filter="url(#soft)">${shadow.shapes}</g></svg>`;
    source = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    sources.set(shadow.id, source);
  }
  return source;
}
