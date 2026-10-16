import { cardShadows, type CardShadowId } from "../lib/cardShadows";
import CardShadow from "./CardShadow";

type Props = {
  value: CardShadowId;
  onChange: (value: CardShadowId) => void;
};

export default function ShadowPicker({ value, onChange }: Props) {
  return <fieldset className="shadow-picker">
    <legend>Shadow overlay</legend>
    <p className="palette-help">Window light and soft foliage shadows over your card color.</p>
    <div className="shadow-options">
      {cardShadows.map((shadow) => <button type="button" key={shadow.id} className={value === shadow.id ? "selected" : ""} aria-label={`Use ${shadow.name} shadow overlay`} aria-pressed={value === shadow.id} onClick={() => onChange(shadow.id)}>
        <span className="shadow-option-preview" aria-hidden="true">
          <CardShadow value={shadow.id} />
          {shadow.id === "none" && <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="m6 6 12 12"/></svg>}
        </span>
        <span className="shadow-option-name">{shadow.name}{shadow.id === "none" && <small>Default</small>}</span>
      </button>)}
    </div>
  </fieldset>;
}
