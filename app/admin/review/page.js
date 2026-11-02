import { getCurrentProfile, createAdminClient } from "../../../lib/supabase/server";
import { StatusPill } from "../../../lib/statusLabels";
import AdminHeader from "../../AdminHeader";

export const dynamic = "force-dynamic";

const TABS = [
  ["queue", "Needs review", ["submitted", "under_review"]],
  ["certified", "Certified", ["certified"]],
  ["delivered", "Delivered", ["delivered"]],
  ["all", "All", null],
];

function fmt(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d) ? iso : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Phoenix" });
}

// Ron's queue of jobs, newest first. (Admins only, via app/admin/layout.js.)
export default async function ReviewQueue({ searchParams }) {
  const profile = await getCurrentProfile();
  const tab = TABS.find((t) => t[0] === (searchParams && searchParams.tab)) || TABS[0];
  const showDemo = searchParams && searchParams.demo === "1";
  const db = createAdminClient();

  let rows = [], counts = {}, err = null;
  if (db) {
    let q = db.from("submissions")
      .select("id, ref, status, client_name, property_address, inspector_name, inspection_type, inspection_date, submitted_at, photo_count, letter_link, is_demo, payment_status, company:companies(name)")
      .order("submitted_at", { ascending: false }).limit(200);
    if (!showDemo) q = q.eq("is_demo", false);
    if (tab[2]) q = q.in("status", tab[2]);
    const r = await q;
    if (r.error) err = r.error.message; else rows = r.data;
    const c = await db.from("submissions").select("status").eq("is_demo", false).in("status", ["submitted", "under_review"]);
    counts.queue = (c.data || []).length;
  } else err = "Database isn't configured.";

  return (
    <>
      <AdminHeader title="Review queue" profile={profile} />
      <div className="shell" style={{ maxWidth: 1080 }}>
        <div className="tabs">
          {TABS.map(([k, label]) => (
            <a key={k} href={`/admin/review?tab=${k}${showDemo ? "&demo=1" : ""}`} className={"tab" + (k === tab[0] ? " on" : "")}>
              {label}{k === "queue" && counts.queue ? <span className="count">{counts.queue}</span> : null}
            </a>
          ))}
          <a className="tab right" href={`/admin/review?tab=${tab[0]}${showDemo ? "" : "&demo=1"}`}>{showDemo ? "Hide demo jobs" : "Show demo jobs"}</a>
        </div>

        {err && <div className="card"><p className="err">Couldn't load jobs: {err}</p></div>}
        {!err && rows.length === 0 && <div className="card"><p className="intro">{tab[0] === "queue" ? "Nothing waiting. New submissions show up here, and admins get an email." : "No jobs here yet."}</p></div>}
        {rows.length > 0 && (
          <div className="table-wrap">
            <table className="track">
              <thead><tr><th>Job</th><th>Status</th><th>Property</th><th>Client</th><th>Company / inspector</th><th>Inspected</th><th>Submitted</th><th>Letter</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td><a href={`/admin/review/${encodeURIComponent(r.ref)}`}><b>{r.ref}</b></a>{r.is_demo ? " · demo" : ""}</td>
                    <td><StatusPill status={r.status} /></td>
                    <td>{r.property_address || "—"}</td>
                    <td>{r.client_name || "—"}</td>
                    <td>{(r.company && r.company.name) || "—"}<br /><span className="hint">{r.inspector_name}</span></td>
                    <td>{r.inspection_date || "—"}</td>
                    <td>{fmt(r.submitted_at)}</td>
                    <td>{r.letter_link ? <a href={r.letter_link} target="_blank" rel="noreferrer">Open</a> : <span className="hint">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="hint" style={{ marginTop: 10 }}>Jobs submitted before sign-in was added are still in the old <a href="/tracker">tracker</a> until records are moved into the database.</p>
      </div>
    </>
  );
}
