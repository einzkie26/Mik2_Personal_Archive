import { archiveRequest, supabase } from "./supabase";

export type ActivityGroup = "all" | "security" | "archive";
export type ActivityLog = {
  id: string;
  created_at: string;
  event: string;
  outcome: "success" | "failure" | "blocked";
  summary: string;
  resource_label: string | null;
};

export const activityPageSize = 20;
const securityEvents = ["owner_signed_in", "owner_signed_out", "sign_in_failed", "captcha_rejected", "owner_access_denied", "login_rate_limited", "password_changed"];
const archiveEvents = ["entry_created", "entry_updated", "entry_deleted", "collection_created", "collection_updated", "collection_deleted", "profile_updated"];

export async function getActivityLogs(token: string, group: ActivityGroup, page: number, signal: AbortSignal) {
  await archiveRequest("/owner", token);
  let request = supabase.from("archive_activity_logs")
    .select("id,created_at,event,outcome,summary,resource_label", { count: "exact" })
    .order("created_at", { ascending: false }).order("id", { ascending: false });
  if (group !== "all") request = request.in("event", group === "security" ? securityEvents : archiveEvents);
  const { data, error, count } = await request.range(page * activityPageSize, (page + 1) * activityPageSize - 1).abortSignal(signal);
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") throw new Error("Activity logs need the latest archive database update.");
    throw new Error("Activity logs could not be loaded. Please try again.");
  }
  return { entries: data as ActivityLog[], count: count ?? 0 };
}
