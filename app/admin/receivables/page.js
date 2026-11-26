import { redirect } from "next/navigation";
import { getCurrentProfile, createAdminClient } from "../../../lib/supabase/server";
import { isOffice } from "../../../lib/roles";
import { receivables, BUCKETS } from "../../../lib/receivables";
import AdminHeader from "../../AdminHeader";
import ArActions from "./ArActions";

export const dynamic = "force-dynamic";
const money = (c) => `$${(Number(c || 0) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Accounts receivable (Nov 25): what each company owes, aged, with Charge now / Send reminder.
export default async function Receivables() {
  const profile = await getCurrentProfile();
  if (profile && !isOffice(profile)) redirect("/admin/review");
  const db = createAdminClient();
  let data = null, err = null;
  if (db) { try { data = await receivables(db); } catch (e) { err = e.message; } } else err = "Database isn't configured.";

  return (
    <>
      <AdminHeader title="Accounts receivable" profile={profile} />
      <main className="shell" style={{ maxWidth: 1080 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0 }}>Accounts receivable</h1>
            <p className="intro" style={{ margin: "6px 0 0" }}>What each company still owes: failed charges, pay-per-job jobs not charged yet, and unpaid re-inspection fees. Oldest first.</p>
          </div>
          {data && data.count > 0 && <a className="btn ghost" href="/api/admin/receivables" style={{ textDecoration: "none" }}>Download CSV</a>}
        </div>
        {err && <p className="err">{err}</p>}
        {data && (
          <>
            <div className="card ar-totals">
              <div><span>Total owed</span><b style={data.totals.total ? { color: "var(--err)" } : undefined}>{money(data.totals.total)}</b></div>
              {BUCKETS.map(([k, label]) => <div key={k}><span>{label}</span><b>{money(data.totals[k])}</b></div>)}
            </div>
            {data.count === 0 && <div className="card"><p className="intro" style={{ margin: 0 }}>Nothing owed. Every job and re-inspection fee is paid, waived or still in progress.</p></div>}
            {data.companies.map((c) => (
              <section className="card" key={c.id || "none"} style={{ marginTop: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
                  <h3 style={{ margin: 0 }}>{c.name}</h3>
                  <span className="hint" style={{ margin: 0 }}><b style={{ color: "var(--ink)" }}>{money(c.total)}</b> owed{BUCKETS.filter(([k]) => c[k]).map(([k, l]) => ` · ${l}: ${money(c[k])}`).join("")}</span>
                </div>
                <div className="table-wrap" style={{ marginTop: 10 }}>
                  <table className="track">
                    <thead><tr><th>Job</th><th>What</th><th>Property</th><th>Amount</th><th>Status</th><th>Age</th><th></th></tr></thead>
                    <tbody>
                      {c.lines.map((l) => (
                        <tr key={`${l.kind}-${l.ref}-${l.round || 0}`}>
                          <td><a href={`/admin/review/${encodeURIComponent(l.ref)}`}>{l.ref}</a></td>
                          <td>{l.kind === "fee" ? `Re-inspection fee${l.round > 1 ? ` (round ${l.round})` : ""}` : "Job"}</td>
                          <td>{l.address || "—"}</td>
                          <td>{money(l.amount_cents)}</td>
                          <td>{{ failed: "Charge failed", processing: "Still clearing", unpaid: "Not charged yet" }[l.state] || l.state}</td>
                          <td className={l.days > 60 ? "ar-old" : l.days > 30 ? "ar-mid" : ""}>{l.days} day{l.days === 1 ? "" : "s"}</td>
                          <td><ArActions item={{ ref: l.ref, kind: l.kind, round: l.round, state: l.state }} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </>
        )}
      </main>
    </>
  );
}
