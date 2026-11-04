const wordSegmenter = typeof Intl.Segmenter === "function"
  ? new Intl.Segmenter("en", { granularity: "word" })
  : null;
const sentenceSegmenter = typeof Intl.Segmenter === "function"
  ? new Intl.Segmenter("en", { granularity: "sentence" })
  : null;

export function getTextStatistics(text: string) {
  const normalized = text.replace(/\r\n?/g, "\n").trim();
  // A poem's single line breaks belong to the same paragraph or stanza.
  const paragraphs = normalized ? normalized.split(/\n\s*\n/u).filter(part => part.trim()) : [];
  let words = 0;
  if (wordSegmenter) {
    for (const part of wordSegmenter.segment(normalized)) {
      if (part.isWordLike) words += 1;
    }
  } else {
    words = normalized.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
  }
  let sentences = 0;
  for (const paragraph of paragraphs) {
    const content = paragraph.replace(/\n/g, " ");
    const segments = sentenceSegmenter
      ? sentenceSegmenter.segment(content)
      : (content.match(/[^.!?。！？]+[.!?。！？]*/gu) ?? []).map(segment => ({ segment }));
    for (const part of segments) {
      if (/[\p{L}\p{N}]/u.test(part.segment)) sentences += 1;
    }
  }
  return { words, paragraphs: paragraphs.length, sentences };
}
