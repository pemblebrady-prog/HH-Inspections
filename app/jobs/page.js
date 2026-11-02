import { redirect } from "next/navigation";
import { getCurrentProfile, createAdminClient } from "../../lib/supabase/server";
import { authEnabled } from "../../lib/supabase/config";
import { StatusPill } from "../../lib/statusLabels";
import AppHeader from "../AppHeader";

export const dynamic = "force-dynamic";

const PAY = { paid: "Paid", processing: "Processing", failed: "Failed", unpaid: "Not charged", waived: "No charge", refunded: "Refunded" };
function fmt(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d) ? iso : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Phoenix" });
}

// Inspectors: their own jobs. Company owners: every job from their company.
export default async function MyJobs() {
  if (!authEnabled) redirect("/");
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login?next=/jobs");
  if (profile.role === "admin") redirect("/admin/review");
  const owner = profile.role === "company_owner";
  const db = createAdminClient();

  let rows = [], err = null;
  if (db) {
    let q = db.from("submissions")
      .select("ref, status, payment_status, amount_cents, property_address, client_name, inspector_name, inspection_date, submitted_at, delivered_at, final_pdf_id")
      .eq("is_demo", false).order("submitted_at", { ascending: false }).limit(200);
    q = owner && profile.company_id ? q.eq("company_id", profile.company_id) : q.eq("inspector_id", profile.id);
    const r = await q;
    if (r.error) err = r.error.message; else rows = r.data;
  } else err = "Database isn't configured.";

  const open = rows.filter((r) => !["delivered", "canceled"].includes(r.status)).length;

  return (
    <>
      <AppHeader title="My jobs" profile={profile} wide />
      <div className="shell" style={{ maxWidth: 1080 }}>
        <div className="track-head">
          <h2>{owner ? `${(profile.company && profile.company.name) || "Company"} jobs` : "My jobs"}</h2>
          {rows.length > 0 && <div className="track-stats"><span><b>{rows.length}</b> total</span><span><b>{open}</b> in progress</span></div>}
        </div>
        {err && <div className="card"><p className="err">Couldn't load jobs: {err}</p></div>}
        {!err && rows.length === 0 && <div className="card"><p className="intro">No jobs yet. <a href="/">Submit your first one</a>.</p></div>}
        {rows.length > 0 && (
          <div className="table-wrap">
            <table className="track">
              <thead><tr><th>Job</th><th>Status</th><th>Property</th><th>Client</th>{owner && <th>Inspector</th>}<th>Inspected</th><th>Submitted</th><th>Payment</th><th>Report</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.ref}>
                    <td><b>{r.ref}</b></td>
                    <td><StatusPill status={r.status} /></td>
                    <td>{r.property_address || "—"}</td>
                    <td>{r.client_name || "—"}</td>
                    {owner && <td>{r.inspector_name || "—"}</td>}
                    <td>{r.inspection_date || "—"}</td>
                    <td>{fmt(r.submitted_at)}</td>
                    <td>{PAY[r.payment_status] || r.payment_status}{r.amount_cents && r.payment_status !== "waived" ? ` · $${(r.amount_cents / 100).toFixed(0)}` : ""}</td>
                    <td>{r.final_pdf_id
                      ? <a href={`/api/jobs/report?ref=${encodeURIComponent(r.ref)}`} target="_blank" rel="noreferrer">Download PDF</a>
                      : <span className="hint">{r.status === "certified" ? "Sending soon" : "Not ready"}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="hint" style={{ marginTop: 10 }}>Status: <b>Uploading photos</b> → <b>Needs review</b> (with the engineer) → <b>Under review</b> → <b>Certified</b> → <b>Delivered</b> (report emailed). Jobs on hold need a payment update{owner ? <> under <a href="/billing">Billing</a></> : " from your company owner"}.</p>
      </div>
    </>
  );
}
