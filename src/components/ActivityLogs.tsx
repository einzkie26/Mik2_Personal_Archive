import { useEffect, useState } from "react";
import { activityPageSize, getActivityLogs, type ActivityGroup, type ActivityLog } from "../lib/activityLogs";
import ArchiveDialog from "./ArchiveDialog";

type Props = { open: boolean; token: string; onClose: () => void };
const groupNames: Record<ActivityGroup, string> = { all: "All activity", security: "Sign-ins & security", archive: "Archive changes" };
const outcomeNames = { success: "Successful", failure: "Failed", blocked: "Blocked" };
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

export default function ActivityLogs({ open, token, onClose }: Props) {
  const [group, setGroup] = useState<ActivityGroup>("all");
  const [page, setPage] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [entries, setEntries] = useState<ActivityLog[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) { setEntries([]); setCount(0); setPage(0); return; }
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setEntries([]);
    getActivityLogs(token, group, page, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      if (page > 0 && result.count <= page * activityPageSize) { setPage(Math.max(0, Math.ceil(result.count / activityPageSize) - 1)); return; }
      setEntries(result.entries);
      setCount(result.count);
    }).catch(cause => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Activity logs could not be loaded.");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [open, token, group, page, refresh]);

  return <ArchiveDialog open={open} onClose={onClose} closeLabel="Close activity logs" ariaLabel="Activity logs" className="activity-logs-modal">
    <p className="eyebrow">Owner access only</p>
    <div className="activity-logs-heading">
      <h2>Activity logs.</h2>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 8 3v6c0 4-3 7-8 9-5-2-8-5-8-9V6l8-3Z" /><path d="m8 12 3 3 5-6" /></svg>
    </div>
    <p className="activity-logs-intro">Sign-ins, security checks, and changes to your archive. Times are shown in your local time zone.</p>
    <div className="activity-logs-toolbar">
      <label>Show activity<select value={group} onChange={event => { setPage(0); setGroup(event.target.value as ActivityGroup); }}>
        {(Object.keys(groupNames) as ActivityGroup[]).map(value => <option key={value} value={value}>{groupNames[value]}</option>)}
      </select></label>
      <button type="button" disabled={loading} onClick={() => { setPage(0); setRefresh(value => value + 1); }} aria-label="Refresh activity logs">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1" /></svg>Refresh
      </button>
    </div>
    <div className="activity-logs-results" aria-busy={loading}>
      {loading && <p className="activity-logs-message" role="status">Loading activity…</p>}
      {!loading && error && <div className="activity-logs-message" role="alert"><p>{error}</p><button type="button" onClick={() => setRefresh(value => value + 1)}>Try again</button></div>}
      {!loading && !error && entries.length === 0 && <div className="activity-logs-message"><p>No activity yet.</p><span>{group === "all" ? "New sign-ins and archive changes will appear here." : "There are no recorded events in this category."}</span></div>}
      {!loading && !error && entries.length > 0 && <ol className="activity-logs-list">
        {entries.map(entry => <li key={entry.id}>
          <span className={`activity-event-marker is-${entry.outcome}`} aria-hidden="true">{entry.outcome === "success" ? "✓" : "!"}</span>
          <div className="activity-event-detail"><p>{entry.summary}</p>{entry.resource_label && <span className="activity-event-resource">{entry.resource_label}</span>}<time dateTime={entry.created_at}>{dateFormat.format(new Date(entry.created_at))}</time></div>
          <span className={`activity-event-outcome is-${entry.outcome}`}>{outcomeNames[entry.outcome]}</span>
        </li>)}
      </ol>}
    </div>
    {!loading && !error && count > 0 && <div className="activity-logs-pagination">
      <span role="status">{page * activityPageSize + 1}–{Math.min((page + 1) * activityPageSize, count)} of {count} events</span>
      <div><button type="button" disabled={page === 0} onClick={() => setPage(value => value - 1)}>Newer</button><button type="button" disabled={(page + 1) * activityPageSize >= count} onClick={() => setPage(value => value + 1)}>Older</button></div>
    </div>}
    <p className="activity-logs-note">This history is visible only to the archive owner. Passwords and security tokens are never included.</p>
  </ArchiveDialog>;
}
