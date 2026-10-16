import { createClient } from "@supabase/supabase-js";
import { projectId, publicAnonKey } from "../../utils/supabase/info";
import { defaultCardFont, getCardFont } from "./cardFonts";
import { getCardShadow } from "./cardShadows";

export const supabase = createClient(`https://${projectId}.supabase.co`, publicAnonKey);

export function authLog(event: string, details: Record<string, unknown> = {}) {
  console.info(`[archive-auth] ${event}`, { at: new Date().toISOString(), ...details });
}

export async function archiveRequest(path: string, token?: string, body?: unknown) {
  if (path === "/owner") {
    if (!token) throw new Error("Please sign in to access Card Studio.");
    const { data, error } = await supabase.auth.getUser(token);
    const ownerFlag = data.user?.app_metadata?.archive_owner;
    if (error || (ownerFlag !== true && ownerFlag !== "true")) throw new Error("This account does not have archive owner access.");
    return { owner: true };
  }
  const database = supabase;
  if (path === "/profile") {
    if (body !== undefined) {
      await archiveRequest("/owner", token);
      const input = body as { poet_name: string; quote: string; bio: string; text_size: number; text_color: string; volume: number };
      if (!input || typeof input !== "object" || !Number.isInteger(input.volume) || input.volume < 1 || input.volume > 9999) {
        throw new Error("Volume must be a whole number from 1 to 9999.");
      }
      const { data, error } = await database.from("archive_profile").upsert({ id: true, ...input, updated_at: new Date().toISOString() }).select("*").single();
      if (error) {
        if ((error.code === "PGRST204" || error.code === "42703") && /\bvolume\b/i.test(error.message)) {
          throw new Error("Archive settings need a database update before the volume can be saved.");
        }
        throw new Error("The poet profile could not be saved. Check your owner permissions and database setup.");
      }
      return data;
    }
    const { data, error } = await database.from("archive_profile").select("*").eq("id", true).single();
    if (error) throw new Error("The poet profile is not available. Please apply the archive migration in Supabase.");
    return { ...data, volume: Number.isInteger(data.volume) && data.volume >= 1 && data.volume <= 9999 ? data.volume : 1 };
  }
  if (path !== "/entries") throw new Error("Unknown archive request.");
  if (body !== undefined) {
    const input = body as { number: string; title: string; excerpt: string; category: string; date: string; tone: string; author: string; collection: string; is_public: boolean; image_url?: string; theme_background: string; theme_ink: string; theme_accent: string; font_family?: string; shadow_overlay?: string };
    await archiveRequest("/owner", token);
    const collectionName = input.collection?.trim() || "Personal collection";
    const { data: collection, error: collectionError } = await database.from("archive_collections").upsert({ name: collectionName }, { onConflict: "name" }).select("id").single();
    if (collectionError) throw new Error("The collection could not be saved. Check your owner permissions and database setup.");
    const entryData: Record<string, unknown> = {
      number: input.number, title: input.title, excerpt: input.excerpt, category: input.category,
      date: input.date, tone: input.tone, author: input.author,
      collection_id: collection.id, is_public: input.is_public, image_url: input.image_url || null,
      theme_background: input.theme_background, theme_ink: input.theme_ink, theme_accent: input.theme_accent,
      font_family: getCardFont(input.font_family).id,
      shadow_overlay: getCardShadow(input.shadow_overlay).id,
      updated_at: new Date().toISOString(),
    };
    let { data: entry, error } = await database.from("archive_entries").upsert(entryData).select("*").single();
    for (let retry = 0; error && retry < 2; retry += 1) {
      if (error.code !== "PGRST204" && error.code !== "42703") break;
      if (/\bshadow_overlay\b/i.test(error.message) && "shadow_overlay" in entryData) {
        if (entryData.shadow_overlay !== "none") throw new Error("Saving shadow overlays needs a database update. Apply the card shadow overlays migration in Supabase.");
        delete entryData.shadow_overlay;
      } else if (/\bfont_family\b/i.test(error.message) && "font_family" in entryData) {
        if (entryData.font_family !== defaultCardFont.id) throw new Error("Font choices need a database update before this piece can be saved. Apply the card fonts migration in Supabase.");
        delete entryData.font_family;
      } else break;
      ({ data: entry, error } = await database.from("archive_entries").upsert(entryData).select("*").single());
    }
    if (error) throw new Error("The entry could not be saved. Check your owner permissions and database setup.");
    return { entry: { ...entry, font_family: getCardFont(entry.font_family).id, shadow_overlay: getCardShadow(entry.shadow_overlay).id, collection: collectionName } };
  }
  const [entriesResult, piecesResult, collectionsResult] = await Promise.all([
    database.from("archive_entries").select("*,collection:archive_collections(name)").order("created_at", { ascending: false }).order("updated_at", { ascending: false }).order("number", { ascending: true }),
    database.from("archive_entries").select("number", { count: "exact", head: true }),
    database.from("archive_collections").select("name", { count: "exact" }).order("name"),
  ]);
  const likesResult = await database.from("archive_entry_likes").select("entry_number");
  if (entriesResult.error || piecesResult.error || collectionsResult.error || likesResult.error || piecesResult.count === null || collectionsResult.count === null) throw new Error("The archive database is not available. Please apply the archive migration in Supabase.");
  const likeCounts = (likesResult.data || []).reduce<Record<string, number>>((counts, like) => {
    counts[like.entry_number] = (counts[like.entry_number] || 0) + 1;
    return counts;
  }, {});
  return {
    entries: entriesResult.data.map((entry) => {
      const collection = entry.collection as unknown as { name: string } | null;
      return { ...entry, font_family: getCardFont(entry.font_family).id, shadow_overlay: getCardShadow(entry.shadow_overlay).id, collection: collection?.name || "Personal collection", likes: likeCounts[entry.number] || 0 };
    }),
    pieces: piecesResult.count,
    collections: collectionsResult.count,
    collectionNames: collectionsResult.data.map((collection) => collection.name),
  };
}

export async function toggleArchiveLike(number: string, voterId: string, liked: boolean) {
  const { data, error } = await supabase.rpc("toggle_archive_like", {
    p_entry_number: number,
    p_voter_id: voterId,
    p_liked: liked,
  });
  if (error) throw new Error("The like could not be saved. Please try again.");
  return data as { liked: boolean; count: number };
}

export async function deleteArchiveEntry(number: string, token: string) {
  await archiveRequest("/owner", token);
  const { error } = await supabase.from("archive_entries").delete().eq("number", number);
  if (error) throw new Error("The entry could not be deleted. Check your owner permissions and database setup.");
}

export async function deleteEmptyArchiveCollection(name: string, token: string) {
  await archiveRequest("/owner", token);
  // The collection foreign key rejects deletion if any piece still uses it,
  // including a piece added after the editor last refreshed.
  const { error } = await supabase.from("archive_collections").delete().eq("name", name);
  if (error?.code === "23503") throw new Error("This collection still contains pieces. Move or delete them before deleting the collection.");
  if (error) throw new Error("The collection could not be deleted. Please try again.");
}
