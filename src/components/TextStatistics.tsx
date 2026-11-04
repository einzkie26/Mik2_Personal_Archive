import { useMemo } from "react";
import { getTextStatistics } from "../lib/textStatistics";

export default function TextStatistics({ text, id }: { text: string; id: string }) {
  const statistics = useMemo(() => getTextStatistics(text), [text]);
  return <div id={id} className="text-statistics-group">
    <p className="text-statistics" aria-live="polite" aria-atomic="true">
      {(["word", "paragraph", "sentence"] as const).map(label => {
        const count = statistics[`${label}s`];
        return <span key={label}>{count.toLocaleString("en-US")} {label}{count === 1 ? "" : "s"}</span>;
      })}
    </p>
    <p className="text-statistics-hint">No word limit. Separate paragraphs with a blank line.</p>
  </div>;
}
