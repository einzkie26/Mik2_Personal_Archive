export const cardFonts = [
  { id: "cormorant", name: "Cormorant Garamond", family: '"Cormorant Garamond", Georgia, serif' },
  { id: "fraunces", name: "Fraunces", family: '"Fraunces", Georgia, serif' },
  { id: "instrument", name: "Instrument Serif", family: '"Instrument Serif", Georgia, serif' },
  { id: "lora", name: "Lora", family: '"Lora", Georgia, serif' },
  { id: "playfair", name: "Playfair Display", family: '"Playfair Display", Georgia, serif' },
  { id: "dm-sans", name: "DM Sans", family: '"DM Sans", Arial, sans-serif' },
  { id: "space-mono", name: "Space Mono", family: '"Space Mono", "Courier New", monospace' },
  { id: "caveat", name: "Caveat", family: '"Caveat", "Segoe Print", cursive' },
  { id: "georgia", name: "Georgia", family: 'Georgia, "Times New Roman", serif' },
  { id: "palatino", name: "Palatino", family: '"Palatino Linotype", Palatino, Georgia, serif' },
] as const;

export type CardFontId = typeof cardFonts[number]["id"];

export const defaultCardFont = cardFonts[0];

export function getCardFont(id?: string) {
  return cardFonts.find((font) => font.id === id) || defaultCardFont;
}
