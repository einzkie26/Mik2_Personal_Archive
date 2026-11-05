import { pieceDescription, pieceImagePath, pieceNumberFromPath, piecePath, pieceShareUrl, pieceUrl } from "../src/lib/pieceLinks.ts";
import type { ArchiveEntry } from "../src/lib/archiveTypes.ts";

type Options = {
  databaseUrl: string;
  anonKey: string;
  loadShell: () => Promise<string>;
  renderImage: (entry: ArchiveEntry) => Promise<ArrayBuffer>;
  fetch?: typeof fetch;
};

const noStore = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);

export function piecePageHtml(shell: string, entry: ArchiveEntry | null, origin: string) {
  // Replace generic document metadata rather than leaving duplicate OG tags.
  const clean = shell.replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, "")
    .replace(/<meta\b[^>]*(?:name|property)=["'](?:description|og:[^"']*|twitter:[^"']*|robots)["'][^>]*>/gi, "")
    .replace(/<link\b[^>]*rel=["']canonical["'][^>]*>/gi, "");
  if (!entry) return clean.replace("</head>", '<title>Piece unavailable · Mikhai</title><meta name="robots" content="noindex"></head>');
  const title = escapeHtml(entry.title);
  const description = escapeHtml(pieceDescription(entry.excerpt));
  const url = escapeHtml(pieceUrl(entry.number, origin));
  const version = entry.updated_at || entry.created_at;
  const shareUrl = escapeHtml(pieceShareUrl(entry.number, origin, version));
  const image = escapeHtml(new URL(pieceImagePath(entry.number, version), origin).href);
  const author = escapeHtml(entry.author || "Mikhai");
  const metadata = `<title>${title} · ${author}</title>
<meta name="description" content="${description}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Mikhai: A Personal Archive">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${shareUrl}">
<meta property="og:image" content="${image}">
<meta property="og:image:secure_url" content="${image}">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${title} by ${author}: ${description}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${image}">`;
  return clean.replace("</head>", `${metadata}</head>`).replace("</body>", `<noscript><main><a href="/">The archive</a><h1>${title}</h1><p>By ${author}</p><p style="white-space:pre-wrap">${escapeHtml(entry.excerpt)}</p></main></noscript></body>`);
}

export function createPieceShareHandler(options: Options) {
  const fetcher = options.fetch || fetch;
  return async (request: Request) => {
    if (!["GET", "HEAD"].includes(request.method)) return new Response("Method not allowed", { status: 405, headers: { ...noStore, Allow: "GET, HEAD" } });
    const url = new URL(request.url);
    const imageRequest = url.searchParams.get("image") === "1" || url.pathname.endsWith("/image.png");
    const number = url.searchParams.get("number") || pieceNumberFromPath(url.pathname.replace(/\/image\.png$/, ""));
    const valid = number && pieceNumberFromPath(piecePath(number)) === number;
    try {
      let entry: ArchiveEntry | null = null;
      if (valid) {
        const database = new URL("/rest/v1/archive_entries", options.databaseUrl);
        const fields = "number,title,excerpt,category,date,author,is_public,created_at,updated_at,theme_background,theme_ink,theme_accent,font_family,shadow_overlay,poem_text_size";
        database.search = new URLSearchParams({ select: fields + (imageRequest ? ",image_url" : ""), number: `eq.${number}`, is_public: "eq.true", limit: "1" }).toString();
        // Always use anonymous access. Never forward a viewer's owner session to
        // public metadata or image endpoints, even when the request has cookies.
        const response = await fetcher(database.href, {
          headers: { apikey: options.anonKey, Authorization: `Bearer ${options.anonKey}` },
          signal: AbortSignal.timeout(10_000), cache: "no-store",
        });
        if (!response.ok) throw new Error("Archive unavailable");
        const rows = await response.json();
        const found = Array.isArray(rows) ? rows[0] : null;
        if (found?.is_public === true && found.number === number && typeof found.title === "string" && typeof found.excerpt === "string") entry = found;
      }
      if (imageRequest) {
        if (!entry) return new Response(null, { status: 404, headers: noStore });
        if (request.method === "HEAD") return new Response(null, { headers: { ...noStore, "Content-Type": "image/png" } });
        const image = await options.renderImage(entry);
        return new Response(image, { headers: { ...noStore, "Content-Type": "image/png" } });
      }
      const html = piecePageHtml(await options.loadShell(), entry, url.origin);
      return new Response(request.method === "HEAD" ? null : html, { status: entry ? 200 : 404, headers: { ...noStore, "Content-Type": "text/html; charset=utf-8" } });
    } catch {
      return new Response(request.method === "HEAD" ? null : "This piece is temporarily unavailable. Please try again.", { status: 503, headers: { ...noStore, "Content-Type": "text/plain; charset=utf-8", "Retry-After": "30" } });
    }
  };
}
