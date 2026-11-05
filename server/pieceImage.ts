import { createElement as h } from "react";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse, type ImageResponseOptions } from "@vercel/og";
import type { ArchiveEntry } from "../src/lib/archiveTypes.ts";
import { getCardFont } from "../src/lib/cardFonts.ts";
import { getCardShadowSource } from "../src/lib/cardShadows.ts";
import { getPoemTextSize } from "../src/lib/poemTextSize.ts";

const fontFiles = new Map<string, Promise<Buffer>>();
function fontFile(name: string) {
  let loading = fontFiles.get(name);
  if (!loading) {
    loading = readFile(join(process.cwd(), "server/fonts", `${name}.ttf`));
    fontFiles.set(name, loading);
    loading.catch(() => fontFiles.delete(name));
  }
  return loading;
}

function color(value: string | undefined, fallback: string) {
  return value && /^#(?:[\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i.test(value) ? value : fallback;
}

export async function renderPieceImage(entry: ArchiveEntry) {
  const selectedFont = getCardFont(entry.font_family).id;
  // System fonts are not distributed with Linux functions. Use the closest
  // bundled serif for Georgia and Palatino; Google font choices use their own faces.
  const font = selectedFont === "georgia" ? "lora" : selectedFont === "palatino" ? "cormorant" : selectedFont;
  const titleWeight = font === "space-mono" ? 700 : font === "instrument" ? 400 : 600;
  const [regular, title, ui] = await Promise.all([fontFile(`${font}-400`), fontFile(`${font}-${titleWeight}`), fontFile("dm-sans-400")]);
  const fonts: ImageResponseOptions["fonts"] = [
    { name: "Poem", data: regular, weight: 400, style: "normal" },
    { name: "Poem", data: title, weight: titleWeight, style: "normal" },
    { name: "Archive UI", data: ui, weight: 400, style: "normal" },
  ];
  const ink = color(entry.theme_ink, "#fff9ee");
  const accent = color(entry.theme_accent, "#f4c7a1");
  // Uploads are embedded images. Never let the image renderer fetch arbitrary
  // URLs from saved content (including local or private network addresses).
  const image = entry.image_url && /^data:image\/(?:png|jpeg|gif|webp);base64,[a-z\d+/=\s]+$/i.test(entry.image_url) ? entry.image_url : null;
  const shadowSource = getCardShadowSource(entry.shadow_overlay);
  const shadow = shadowSource ? `data:image/svg+xml;base64,${Buffer.from(decodeURIComponent(shadowSource.split(",")[1])).toString("base64")}` : null;
  const text = Array.from(entry.excerpt.trim().replace(/\r\n?/g, "\n")).slice(0, 1000).join("");
  const bodyFontSize = Math.round(38 * getPoemTextSize(entry.poem_text_size) / 100);
  const bodyLines = Math.max(1, Math.floor(258 / Math.ceil(bodyFontSize * 1.3)));
  const artwork = (backgroundImage: string | null) => h("div", { style: {
    width: "100%", height: "100%", display: "flex", position: "relative", overflow: "hidden",
    backgroundColor: color(entry.theme_background, "#bf593f"), color: ink, fontFamily: "Poem",
  } },
    backgroundImage && h("img", { src: backgroundImage, width: 1200, height: 630, style: { position: "absolute", left: 0, top: 0, objectFit: "cover", opacity: .28 } }),
    shadow && h("img", { src: shadow, width: 1200, height: 630, style: { position: "absolute", left: 0, top: 0, objectFit: "cover" } }),
    h("div", { style: { position: "absolute", left: 28, top: 28, width: 1144, height: 574, border: `2px solid ${accent}` } }),
    h("div", { style: { position: "absolute", left: 70, top: 55, fontFamily: "Archive UI", fontSize: 17, letterSpacing: 4, color: accent } }, `PERSONAL ARCHIVE · ${entry.category.toUpperCase()}`),
    h("div", { style: { display: "block", position: "absolute", left: 70, top: 100, width: 1060, fontSize: 64, fontWeight: titleWeight, lineHeight: 1.05, lineClamp: 2, overflow: "hidden" } }, entry.title),
    h("div", { style: { display: "block", position: "absolute", left: 70, top: 245, width: 1060, height: 258, fontSize: bodyFontSize, lineHeight: 1.3, whiteSpace: "pre-wrap", wordBreak: "break-word", lineClamp: bodyLines, overflow: "hidden" } }, text),
    h("div", { style: { display: "flex", justifyContent: "space-between", position: "absolute", left: 70, right: 70, bottom: 56, fontFamily: "Archive UI", fontSize: 21 } },
      h("span", { style: { color: accent } }, entry.author || "Mikhai"),
      h("span", {}, "Read the full piece ↗"),
    ),
  );
  const render = async (source: string | null) => {
    const image = new ImageResponse(artwork(source), { width: 1200, height: 630, fonts });
    // Finish rendering before sending headers so a damaged upload can fall back
    // to its palette and writing instead of producing a broken thumbnail.
    return image.arrayBuffer();
  };
  try {
    return await render(image);
  } catch (error) {
    if (!image) throw error;
    return render(null);
  }
}
