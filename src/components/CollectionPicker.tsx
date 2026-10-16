import { useId } from "react";

type Props = {
  names: string[];
  value: string;
  creatingNew: boolean;
  onChange: (name: string, creatingNew: boolean) => void;
  autoFocusNew?: boolean;
};

export default function CollectionPicker({ names, value, creatingNew, onChange, autoFocusNew = true }: Props) {
  const helpId = useId();
  const options = Array.from(new Set([...names, ...(!creatingNew && value ? [value] : [])]))
    .sort((first, second) => first.localeCompare(second));

  return <div className="collection-picker">
    <label>Collection
      <select value={creatingNew ? "new" : `collection:${value}`} onChange={(event) => {
        const selected = event.target.value;
        onChange(selected === "new" ? "" : selected.slice("collection:".length), selected === "new");
      }}>
        {options.map((name) => <option key={name} value={`collection:${name}`}>{name}</option>)}
        <option value="new">Create new collection…</option>
      </select>
    </label>
    {creatingNew && <>
      <label>New collection name
        <input value={value} onChange={(event) => onChange(event.target.value, true)} maxLength={80} placeholder="Name your collection" required autoFocus={autoFocusNew} aria-describedby={helpId} />
      </label>
      <small id={helpId} className="collection-picker-help">Saved when you save this piece.</small>
    </>}
  </div>;
}
