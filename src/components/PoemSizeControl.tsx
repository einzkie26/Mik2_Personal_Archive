import { useId } from "react";
import { defaultPoemTextSize, minimumPoemTextSize, maximumPoemTextSize } from "../lib/poemTextSize";

type Props = {
  value: number;
  onChange: (value: number) => void;
};

export default function PoemSizeControl({ value, onChange }: Props) {
  const id = useId();
  return <div className="poem-size-control">
    <div className="poem-size-heading"><label htmlFor={id}>Poem text size</label><output htmlFor={id}>{value}%</output></div>
    <input id={id} type="range" min={minimumPoemTextSize} max={maximumPoemTextSize} step={5} value={value} onChange={(event) => onChange(Number(event.target.value))} aria-valuetext={`${value} percent`} aria-describedby={`${id}-help`} />
    <div className="poem-size-footer"><small id={`${id}-help`}>Long poems shrink to fit the card.</small><button type="button" onClick={() => onChange(defaultPoemTextSize)} disabled={value === defaultPoemTextSize}>Reset size</button></div>
  </div>;
}
