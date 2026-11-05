import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { projectId, publicAnonKey } from "../utils/supabase/info";
import { createPieceShareHandler } from "../server/pieceSharing";
import { renderPieceImage } from "../server/pieceImage";

const handler = createPieceShareHandler({
  databaseUrl: `https://${projectId}.supabase.co`,
  anonKey: publicAnonKey,
  loadShell: () => readFile(join(process.cwd(), "dist/index.html"), "utf8"),
  renderImage: renderPieceImage,
});

export default { fetch: handler };
