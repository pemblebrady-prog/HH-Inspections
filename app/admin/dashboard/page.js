import { redirect } from "next/navigation";
import { getCurrentProfile, createAdminClient } from "../../../lib/supabase/server";
import { isOffice } from "../../../lib/roles";
import { receivables } from "../../../lib/receivables";
import AdminHeader from "../../AdminHeader";

export const dynamic = "force-dynamic";
const money = (c) => `$${(Number(c || 0) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// Start of today in Phoenix (no daylight saving: UTC-7 all year).
function todayStart() {
  const d = new Date().toLocaleDateString("en-CA", { timeZone: "America/Phoenix" });
  return new Date(`${d}T00:00:00-07:00`).toISOString();
}
const when = (iso) => (iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Phoenix" }) : "");

// Office dashboard (Nov 25): the House & Home office manager's home screen. Admins can open it from the menu.
export default async function Dashboard() {
  const profile = await getCurrentProfile();
  if (profile && !isOffice(profile)) redirect("/admin/review");
  const db = createAdminClient();
  if (!db) return <main className="shell"><p className="err">Database isn't configured.</p></main>;
  const since = todayStart();

  const [jobs, rounds, newOrders, orderCount, today, delivered, paid, todayOrders, ar] = await Promise.all([
    db.from("submissions").select("status, payment_status").eq("is_demo", false).in("status", ["on_hold", "submitted", "under_review", "corrections", "cannot_certify", "certified"]).limit(5000)
      .then((r) => (r.error ? db.from("submissions").select("status, payment_status").eq("is_demo", false).in("status", ["on_hold", "submitted", "under_review", "corrections", "certified"]).limit(5000) : r)),
    db.from("correction_rounds").select("status").in("status", ["waiting", "awaiting_payment", "submitted"]).limit(5000),
    db.from("orders").select("ref, property_address, requested_at, created_at, scheduled_at, inspector_id, requester").in("status", ["new"]).order("created_at", { ascending: true }).limit(6),
    db.from("orders").select("inspector_id, scheduled_at").in("status", ["new", "scheduled"]).limit(5000),
    db.from("submissions").select("ref, property_address, inspector_name, submitted_at, company:companies(name)").eq("is_demo", false).gte("submitted_at", since).order("submitted_at", { ascending: false }).limit(20),
    db.from("submissions").select("ref, property_address, delivered_at").eq("is_demo", false).gte("delivered_at", since).order("delivered_at", { ascending: false }).limit(20),
    db.from("payments").select("amount_cents, status, created_at").gte("created_at", since).limit(500),
    db.from("orders").select("ref").gte("created_at", since).limit(200),
    receivables(db).catch(() => null),
  ]);

  const count = (st) => (jobs.data || []).filter((j) => j.status === st).length;
  const onHoldPay = (jobs.data || []).filter((j) => j.status === "on_hold" && ["unpaid", "failed"].includes(j.payment_status)).length;
  const rcount = (st) => (rounds.data || []).filter((r) => r.status === st).length;
  const openOrders = orderCount.data || [];
  const unassigned = openOrders.filter((o) => !o.inspector_id).length;
  const unscheduled = openOrders.filter((o) => o.inspector_id && !o.scheduled_at).length;
  const paidToday = (paid.data || []).filter((p) => p.status === "paid").reduce((a, p) => a + p.amount_cents, 0);
  const failedToday = (paid.data || []).filter((p) => p.status === "failed").length;

  const tiles = [
    { label: "Needs review", n: count("submitted"), href: "/admin/review?tab=queue", hint: count("under_review") ? `${count("under_review")} under review` : "" },
    { label: "Cannot certify, refund needed", n: count("cannot_certify"), href: "/admin/review?tab=refund", alert: true },
    { label: "Certified, ready to send", n: count("certified"), href: "/admin/review?tab=certified" },
    { label: "Corrections waiting on a follow-up", n: rcount("waiting") + rcount("awaiting_payment"), href: "/admin/review?tab=corrections", hint: rcount("awaiting_payment") ? `${rcount("awaiting_payment")} waiting for the fee` : "" },
    { label: "Follow-ups in, with the engineer", n: rcount("submitted"), href: "/admin/review?tab=queue" },
    { label: "On hold for payment", n: onHoldPay, href: "/admin/receivables", alert: true },
    { label: "Orders to assign", n: unassigned, href: "/admin/orders", hint: unscheduled ? `${unscheduled} assigned, not scheduled` : "" },
  ];

  return (
    <>
      <AdminHeader title="Dashboard" profile={profile} />
      <main className="shell" style={{ maxWidth: 1080 }}>
        <h1 style={{ margin: "0 0 4px" }}>Dashboard</h1>
        <p className="intro" style={{ marginTop: 0 }}>What needs the office's attention. Tap anything to open it.</p>

        <div className="dash-tiles">
          {tiles.map((t) => (
            <a key={t.label} href={t.href} className={"dash-tile" + (t.n && t.alert ? " alert" : "") + (t.n ? "" : " zero")}>
              <b>{t.n}</b><span>{t.label}</span>{t.hint && <em>{t.hint}</em>}
            </a>
          ))}
        </div>

        <div className="dash-grid">
          <section className="card">
            <h3 style={{ marginTop: 0 }}>Money</h3>
            {ar ? (
              <table className="kv small"><tbody>
                <tr><th><a href="/admin/receivables">Owed to House &amp; Home</a></th><td><b style={ar.totals.total ? { color: "var(--err)" } : undefined}>{money(ar.totals.total)}</b>{ar.count ? ` (${plural(ar.count, "item", "items")})` : ""}</td></tr>
                {ar.totals.b61 > 0 && <tr><th>Over 60 days</th><td style={{ color: "var(--err)" }}>{money(ar.totals.b61)}</td></tr>}
                <tr><th>Paid today</th><td>{money(paidToday)}</td></tr>
                {failedToday > 0 && <tr><th>Charges failed today</th><td style={{ color: "var(--err)" }}>{failedToday}</td></tr>}
              </tbody></table>
            ) : <p className="hint">Couldn't load payments.</p>}
            <p className="hint" style={{ marginBottom: 0 }}><a href="/admin/receivables">Accounts receivable</a> · <a href="/admin/reports">Reports</a> · <a href="/admin/statements">Statements</a></p>
          </section>

          <section className="card">
            <h3 style={{ marginTop: 0 }}>New orders</h3>
            {(newOrders.data || []).length === 0 ? <p className="hint">No new orders waiting.</p> : (
              <ul className="dash-list">
                {(newOrders.data || []).map((o) => (
                  <li key={o.ref}><a href={`/admin/orders/${encodeURIComponent(o.ref)}`}><b>{o.ref}</b> {o.property_address || ""}</a>
                    <span className="hint">{(o.requester && (o.requester.company || o.requester.name)) || ""}{o.inspector_id ? "" : " · not assigned"}</span></li>
                ))}
              </ul>
            )}
            <p className="hint" style={{ marginBottom: 0 }}><a href="/admin/orders">All orders</a></p>
          </section>
        </div>

        <section className="card" style={{ marginTop: 16 }}>
          <h3 style={{ marginTop: 0 }}>Today</h3>
          <p className="hint" style={{ marginTop: 0 }}>
            {plural((today.data || []).length, "job submitted", "jobs submitted")} · {plural((delivered.data || []).length, "letter sent", "letters sent")} · {plural((todayOrders.data || []).length, "new order", "new orders")}
          </p>
          {(today.data || []).length > 0 && (
            <ul className="dash-list">
              {(today.data || []).map((j) => (
                <li key={j.ref}><a href={`/admin/review/${encodeURIComponent(j.ref)}`}><b>{j.ref}</b> {j.property_address || ""}</a>
                  <span className="hint">{j.inspector_name || ""}{j.company && j.company.name ? ` · ${j.company.name}` : ""} · {when(j.submitted_at)}</span></li>
              ))}
            </ul>
          )}
          {(delivered.data || []).length > 0 && (
            <p className="hint" style={{ marginBottom: 0 }}>Sent: {(delivered.data || []).map((j, i) => <span key={j.ref}>{i ? ", " : ""}<a href={`/admin/review/${encodeURIComponent(j.ref)}`}>{j.ref}</a></span>)}</p>
          )}
        </section>
      </main>
    </>
  );
}
