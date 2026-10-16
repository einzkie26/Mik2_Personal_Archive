import { cardFonts, defaultCardFont, type CardFontId } from "../lib/cardFonts";

type Props = {
  value: CardFontId;
  onChange: (value: CardFontId) => void;
};

export default function FontPicker({ value, onChange }: Props) {
  return <label>Poem font
    <select value={value} onChange={(event) => onChange(event.target.value as CardFontId)}>
      {cardFonts.map((font) => <option key={font.id} value={font.id} style={{ fontFamily: font.family }}>{font.name}{font.id === defaultCardFont.id ? " (Default)" : ""}</option>)}
    </select>
  </label>;
}
