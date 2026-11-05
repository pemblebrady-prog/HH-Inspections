import { getCurrentProfile, createAdminClient } from "../../../lib/supabase/server";
import AdminHeader from "../../AdminHeader";

export const dynamic = "force-dynamic";

const TABS = [["open", "To schedule", ["new"]], ["scheduled", "Scheduled", ["scheduled"]], ["done", "Inspected", ["inspected"]], ["all", "All", null]];
const LABEL = { new: ["New", "#A2382A", "#fbebeb"], scheduled: ["Scheduled", "#2C6E8C", "#e7f1fb"], inspected: ["Inspected", "#3f7a52", "#e5f4e4"], canceled: ["Canceled", "#5c6b74", "#f0efec"] };
const fmt = (iso, withTime) => iso ? new Date(iso).toLocaleString("en-US", { timeZone: "America/Phoenix", month: "short", day: "numeric", ...(withTime ? { hour: "numeric", minute: "2-digit" } : { year: "numeric" }) }) : "—";

export default async function Orders({ searchParams }) {
  const profile = await getCurrentProfile();
  const tab = TABS.find((t) => t[0] === (searchParams && searchParams.tab)) || TABS[0];
  const search = String((searchParams && searchParams.q) || "").trim().slice(0, 60);
  const db = createAdminClient();
  let rows = [], err = null, counts = {};
  if (db) {
    const build = (cols) => {
      let q = db.from("orders").select(cols)
        .order(tab[0] === "scheduled" ? "scheduled_at" : "requested_at", { ascending: tab[0] === "scheduled" }).limit(300);
      if (tab[2] && !search) q = q.in("status", tab[2]);
      if (search) {
        const s = search.replace(/[%,()*]/g, " ").trim();
        q = q.or([`ref.ilike.%${s}%`, `property_address.ilike.%${s}%`, `requester->>name.ilike.%${s}%`, ...(cols.includes("isn_") ? [`isn_order_number.ilike.%${s}%`] : [])].join(","));
      }
      return q;
    };
    const BASE = "ref, status, property_address, inspection_detail, requester, requested_at, scheduled_at, inspector:profiles!orders_inspector_id_fkey(full_name, email)";
    let r = await build(BASE + ", isn_order_number");
    if (r.error && /isn_order_number/.test(r.error.message)) r = await build(BASE); // migration 0011 not run yet
    if (r.error) err = r.error.message; else rows = r.data;
    const c = await db.from("orders").select("status").eq("status", "new");
    counts.open = (c.data || []).length;
  } else err = "Database isn't configured.";

  return (
    <>
      <AdminHeader title="Orders" profile={profile} />
      <div className="shell" style={{ maxWidth: 1080 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div className="tabs" style={{ flex: 1 }}>
            {TABS.map(([k, label]) => <a key={k} href={`/admin/orders?tab=${k}`} className={"tab" + (k === tab[0] ? " on" : "")}>{label}{k === "open" && counts.open ? <span className="count">{counts.open}</span> : null}</a>)}
          </div>
          <form method="get" action="/admin/orders" style={{ display: "flex", gap: 6 }}>
            <input name="q" defaultValue={search} placeholder="Search order, ISN #, address, name" style={{ padding: "7px 10px", border: "1px solid var(--line)", borderRadius: 6, minWidth: 240 }} />
            {search && <a className="viewswitch" href="/admin/orders" style={{ alignSelf: "center" }}>Clear</a>}
          </form>
        </div>
        {search && <p className="hint" style={{ margin: "0 0 10px" }}>Showing every order matching "{search}".</p>}
        {err && <div className="card"><p className="err">Couldn't load orders: {err}</p></div>}
        {!err && rows.length === 0 && <div className="card"><p className="intro">{search ? "No orders match that search." : 'No orders here. New requests from the request form appear in "To schedule".'}</p></div>}
        {rows.length > 0 && (
          <div className="table-wrap"><table className="track">
            <thead><tr><th>Order</th><th>Status</th><th>Property</th><th>Type</th><th>Requested by</th><th>Requested</th><th>Scheduled</th><th>Inspector</th></tr></thead>
            <tbody>{rows.map((o) => { const L = LABEL[o.status] || [o.status, "#5c6b74", "#f0efec"]; const r = o.requester || {}; return (
              <tr key={o.ref}>
                <td><a href={`/admin/orders/${encodeURIComponent(o.ref)}`}><b>{o.ref}</b></a>{o.isn_order_number ? <><br /><span className="hint">ISN #{o.isn_order_number}</span></> : null}</td>
                <td><span className="pill" style={{ color: L[1], background: L[2] }}>{L[0]}</span></td>
                <td>{o.property_address || "—"}</td>
                <td>{o.inspection_detail || "—"}</td>
                <td>{r.name || "—"}{r.company ? <><br /><span className="hint">{r.company}</span></> : null}</td>
                <td>{fmt(o.requested_at)}</td>
                <td>{fmt(o.scheduled_at, true)}</td>
                <td>{o.inspector ? (o.inspector.full_name || o.inspector.email) : <span className="hint">—</span>}</td>
              </tr>); })}</tbody>
          </table></div>
        )}
      </div>
    </>
  );
}
