import { redirect } from "next/navigation";
import { getCurrentProfile, createAdminClient } from "../../lib/supabase/server";
import { authEnabled } from "../../lib/supabase/config";
import { StatusPill } from "../../lib/statusLabels";
import AppHeader from "../AppHeader";
import { paysByCard } from "../../lib/payPerJob";
import { payLabel } from "../../lib/payLabel";
import { isOffice, isCompanyManager } from "../../lib/roles";
import { canDoFollowup } from "../../lib/corrections";

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
  if (isOffice(profile)) redirect("/admin/review"); // engineers see the jobs they submitted, like inspectors
  const owner = isCompanyManager(profile);
  const db = createAdminClient();
  // Jobs waiting for a card payment get a Pay now button (pay-as-you-go, or no saved payment method).
  let payPerJob = false;
  if (profile.company_id) {
    const { data: co } = await db.from("companies").select("is_internal, pay_per_job, payment_method_id, payment_ready_at").eq("id", profile.company_id).maybeSingle();
    payPerJob = paysByCard(co);
  }

  let rows = [], err = null;
  if (db) {
    const cols = "id, ref, status, inspector_id, company_id, payment_status, amount_cents, property_address, client_name, inspector_name, inspection_date, submitted_at, delivered_at, final_pdf_id";
    const build = (c) => {
      const q = db.from("submissions").select(c).eq("is_demo", false).order("submitted_at", { ascending: false }).limit(200);
      return owner && profile.company_id ? q.eq("company_id", profile.company_id) : q.eq("inspector_id", profile.id);
    };
    let r = await build(cols + ", refunded_cents");
    if (r.error) r = await build(cols); // before migration 0017
    if (r.error) err = r.error.message; else rows = r.data;
  } else err = "Database isn't configured.";

  const open = rows.filter((r) => !["delivered", "canceled"].includes(r.status)).length;

  // Corrections follow-ups (migration 0018): on my jobs, plus House & Home re-inspections assigned to me.
  const roundOf = {}; let todo = [];
  if (db && !err) {
    const ids = rows.map((r) => r.id);
    const [a, b] = await Promise.all([
      ids.length ? db.from("correction_rounds").select("*").in("submission_id", ids).neq("status", "canceled") : { data: [] },
      db.from("correction_rounds").select("*, job:submissions(id, ref, status, property_address, client_name, inspector_id, company_id)").eq("assigned_to", profile.id).in("status", ["waiting", "awaiting_payment"]),
    ]);
    if (!a.error) for (const x of a.data || []) if (!roundOf[x.submission_id] || x.round > roundOf[x.submission_id].round) roundOf[x.submission_id] = x;
    const mineOpen = rows.map((r) => roundOf[r.id] && { ...roundOf[r.id], job: r }).filter((x) => x && ["waiting", "awaiting_payment"].includes(x.status));
    const assigned = b.error ? [] : (b.data || []).filter((x) => x.job && !mineOpen.some((m) => m.id === x.id));
    todo = [...mineOpen, ...assigned].filter((x) => canDoFollowup(profile, x.job, x));
  }
  const roundTag = { draft: "Corrections letter coming", waiting: "Follow-up needed", awaiting_payment: "Fee to pay", submitted: "Follow-up with the engineer", cleared: "Clear letter coming", redo: "More corrections" };

  return (
    <>
      <AppHeader title="My jobs" profile={profile} wide />
      <div className="shell" style={{ maxWidth: 1080 }}>
        <div className="track-head">
          <h2>{owner ? `${(profile.company && profile.company.name) || "Company"} jobs` : "My jobs"}</h2>
          {rows.length > 0 && <div className="track-stats"><span><b>{rows.length}</b> total</span><span><b>{open}</b> in progress</span></div>}
        </div>
        {todo.length > 0 && (
          <div className="card" style={{ marginBottom: 16, padding: 18, borderColor: "#e8c9a6", background: "#fdf4ea" }}>
            <b>Follow-ups for you</b>
            <p className="hint" style={{ margin: "4px 0 8px" }}>The engineer needs photos showing these corrections before the clear letter can be issued.</p>
            {todo.map((x) => (
              <div key={x.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", borderTop: "1px solid #ecdcc8", padding: "8px 0" }}>
                <span><b>{x.job.ref}</b> · {x.job.property_address || x.job.client_name || ""}<br /><span className="hint">{x.corrections.length} correction{x.corrections.length === 1 ? "" : "s"}{x.followup_by === "house_and_home" ? " · House & Home re-inspection" : ""}</span></span>
                {x.status === "awaiting_payment"
                  ? <a className="btn" style={{ padding: "6px 12px", textDecoration: "none" }} href={`/pay/${encodeURIComponent(x.job.ref)}?round=${x.id}`}>Pay fee</a>
                  : <a className="btn" style={{ padding: "6px 12px", textDecoration: "none" }} href={`/follow-up/${encodeURIComponent(x.job.ref)}`}>{x.followup_by === "house_and_home" ? "Re-inspect" : "Send photos"}</a>}
              </div>
            ))}
          </div>
        )}
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
                    <td><StatusPill status={r.status} />{roundOf[r.id] && roundTag[roundOf[r.id].status] && <div className="hint" style={{ marginTop: 4 }}>{roundTag[roundOf[r.id].status]}</div>}</td>
                    <td>{r.property_address || "—"}</td>
                    <td>{r.client_name || "—"}</td>
                    {owner && <td>{r.inspector_name || "—"}</td>}
                    <td>{r.inspection_date || "—"}</td>
                    <td>{fmt(r.submitted_at)}</td>
                    <td>{payLabel(r)}{r.amount_cents && r.payment_status !== "waived" ? ` · $${(r.amount_cents / 100).toFixed(0)}` : ""}
                      {payPerJob && r.status === "on_hold" && r.payment_status !== "paid" && <div><a className="btn" style={{ marginTop: 6, padding: "6px 12px" }} href={`/pay/${encodeURIComponent(r.ref)}`}>Pay now</a></div>}</td>
                    <td>{r.final_pdf_id
                      ? <a href={`/api/jobs/report?ref=${encodeURIComponent(r.ref)}`} target="_blank" rel="noreferrer">Download PDF</a>
                      : <span className="hint">{r.status === "certified" ? "Sending soon" : "Not ready"}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="hint" style={{ marginTop: 10 }}>Status: <b>Uploading photos</b> → <b>Needs review</b> (with the engineer) → <b>Under review</b> → <b>Certified</b> → <b>Delivered</b> (report emailed). If something needs fixing, the job shows <b>Needs corrections</b> until new photos are sent; then the engineer issues a clear letter. Jobs on hold need a payment update{owner ? <> under <a href="/billing">Billing</a></> : " from your company owner"}.</p>
      </div>
    </>
  );
}
