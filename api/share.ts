import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { projectId, publicAnonKey } from "../utils/supabase/info.ts";
import { createPieceShareHandler } from "../server/pieceSharing.ts";

const handler = createPieceShareHandler({
  databaseUrl: `https://${projectId}.supabase.co`,
  anonKey: publicAnonKey,
  loadShell: () => readFile(join(process.cwd(), "dist/index.html"), "utf8"),
  renderImage: async entry => {
    // Reader pages can start without initializing the thumbnail renderer.
    const { renderPieceImage } = await import("../server/pieceImage.ts");
    return renderPieceImage(entry);
  },
});

export default { fetch: handler };
