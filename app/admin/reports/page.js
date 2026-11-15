import { getCurrentProfile, createAdminClient } from "../../../lib/supabase/server";
import { readFilters, runReport, reportRow, STATUS_OPTIONS, PAYMENT_OPTIONS } from "../../../lib/reports";
import AdminHeader from "../../AdminHeader";

export const dynamic = "force-dynamic";

const money = (c) => `$${(Number(c || 0) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const SHOW = 500; // rows on screen; the download has everything

function monthRange(offset) {
  const now = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "America/Phoenix" }) + "T12:00:00Z");
  const a = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
  const b = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset + 1, 0));
  return { from: a.toISOString().slice(0, 10), to: b.toISOString().slice(0, 10) };
}

export default async function Reports({ searchParams }) {
  const profile = await getCurrentProfile();
  const f = readFilters(searchParams || {});
  const db = createAdminClient();
  let data = null, err = null, companies = [], people = [];
  if (db) {
    try {
      [data, { data: companies }, { data: people }] = await Promise.all([
        runReport(db, f),
        db.from("companies").select("id, name").order("name"),
        db.from("profiles").select("id, full_name, email, role").order("full_name"),
      ]);
    } catch (e) { err = e.message; }
  } else err = "Database isn't configured.";

  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
  const inspectors = (people || []).filter((p) => ["inspector", "company_owner", "admin"].includes(p.role));
  const engineers = (people || []).filter((p) => ["engineer", "admin"].includes(p.role));
  const quick = [["This month", monthRange(0)], ["Last month", monthRange(-1)], ["This year", { from: `${monthRange(0).from.slice(0, 4)}-01-01`, to: "" }]];
  const sel = (name, value, opts, all) => (
    <select name={name} defaultValue={value}><option value="">{all}</option>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
  );

  return (
    <>
      <AdminHeader title="Reports" profile={profile} />
      <div className="shell" style={{ maxWidth: 1200 }}>
        <section className="card">
          <h2>Jobs report</h2>
          <form method="get" action="/admin/reports" className="report-filters">
            <label>From<input type="date" name="from" defaultValue={f.from} /></label>
            <label>To<input type="date" name="to" defaultValue={f.to} /></label>
            <label>Company{sel("company", f.company, (companies || []).map((c) => [c.id, c.name]), "All companies")}</label>
            <label>Inspector{sel("inspector", f.inspector, inspectors.map((p) => [p.id, p.full_name || p.email]), "All inspectors")}</label>
            <label>Engineer{sel("engineer", f.engineer, engineers.map((p) => [p.id, p.full_name || p.email]), "All engineers")}</label>
            <label>Status{sel("status", f.status, STATUS_OPTIONS, "All statuses")}</label>
            <label>Payment{sel("payment", f.payment, PAYMENT_OPTIONS, "All payments")}</label>
            <label>Job type{sel("source", f.source, [["order", "From an order (our inspections)"], ["outside", "Outside companies"]], "All jobs")}</label>
            <div className="report-actions">
              <button className="btn" type="submit">Show</button>
              <a className="btn ghost" href="/admin/reports">Clear</a>
            </div>
          </form>
          <p className="hint" style={{ marginTop: 10 }}>
            Quick dates: {quick.map(([l, r], i) => <span key={l}>{i ? " · " : ""}<a href={`/admin/reports?${new URLSearchParams(Object.entries({ ...f, ...r }).filter(([, v]) => v))}`}>{l}</a></span>)}
            {" · "}Dates are when the job was submitted (Arizona time).
          </p>
        </section>

        {err && <div className="card" style={{ marginTop: 18 }}><p className="err">Couldn't run the report: {err}</p></div>}
        {data && (
          <>
            <div className="report-totals">
              <div><span>Jobs</span><b>{data.totals.jobs.toLocaleString()}</b></div>
              <div><span>Charged</span><b>{money(data.totals.charged)}</b></div>
              <div><span>Paid</span><b>{money(data.totals.paid)}</b></div>
              <div><span>Outstanding</span><b style={data.totals.outstanding ? { color: "var(--err)" } : undefined}>{money(data.totals.outstanding)}</b></div>
              <div><span>Delivered</span><b>{data.totals.delivered.toLocaleString()}</b></div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "6px 0 10px", flexWrap: "wrap", gap: 8 }}>
              <p className="hint" style={{ margin: 0 }}>Outstanding = charges still clearing or failed, plus outside-company jobs not charged yet.{data.capped ? " Showing the newest 5,000 jobs; narrow the dates for more." : ""}</p>
              <a className="btn" href={`/api/admin/reports${qs ? "?" + qs : ""}`}>Download spreadsheet (CSV)</a>
            </div>
            {data.rows.length === 0 ? <div className="card"><p className="intro">No jobs match these filters.</p></div> : (
              <div className="table-wrap">
                <table className="track">
                  <thead><tr><th>Job</th><th>Submitted</th><th>Property</th><th>Client</th><th>Company</th><th>Inspector</th><th>Engineer</th><th>Status</th><th>Payment</th><th style={{ textAlign: "right" }}>Amount</th><th>Order</th></tr></thead>
                  <tbody>{data.rows.slice(0, SHOW).map((j) => { const r = reportRow(j); return (
                    <tr key={j.id}>
                      <td><a href={`/admin/review/${encodeURIComponent(j.ref)}`}>{j.ref}</a></td>
                      <td>{r.submitted}</td><td>{r.property}</td><td>{r.client}</td><td>{r.company || "—"}</td><td>{r.inspector}</td><td>{r.engineer || "—"}</td>
                      <td>{r.status}</td><td style={j.payment_status === "failed" ? { color: "var(--err)" } : undefined}>{r.payment}</td>
                      <td style={{ textAlign: "right" }}>{r.amount ? `$${r.amount.toFixed(2)}` : "—"}</td>
                      <td>{r.order ? <a href={`/admin/orders/${encodeURIComponent(r.order)}`}>{r.order}</a> : "—"}{r.isn ? <><br /><span className="hint">ISN #{r.isn}</span></> : null}</td>
                    </tr>); })}</tbody>
                </table>
              </div>
            )}
            {data.rows.length > SHOW && <p className="hint">Showing the first {SHOW} of {data.rows.length.toLocaleString()} jobs. The spreadsheet has all of them.</p>}
          </>
        )}
      </div>
    </>
  );
}
