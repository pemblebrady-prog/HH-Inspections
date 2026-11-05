import { notFound } from "next/navigation";
import { getCurrentProfile, createAdminClient } from "../../../../lib/supabase/server";
import AdminHeader from "../../../AdminHeader";
import OrderActions from "./OrderActions";

export const dynamic = "force-dynamic";

const yn = (b) => (b === true ? "Yes" : b === false ? "No" : "—");
const fmt = (iso) => iso ? new Date(iso).toLocaleString("en-US", { timeZone: "America/Phoenix", weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "—";
// Arizona is UTC-7 all year (no daylight saving).
const azInput = (iso) => iso ? new Date(new Date(iso).getTime() - 7 * 3600e3).toISOString().slice(0, 16) : "";

function KV({ rows }) {
  return <table className="kv"><tbody>{rows.filter(([, v]) => v !== "" && v != null).map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}</tbody></table>;
}

export default async function OrderPage({ params }) {
  const profile = await getCurrentProfile();
  const db = createAdminClient();
  if (!db) notFound();
  const ref = decodeURIComponent(params.ref);
  const { data: o } = await db.from("orders").select("*, job:submissions!orders_submission_id_fkey(ref, status)").eq("ref", ref).maybeSingle();
  if (!o) notFound();
  const { data: people } = await db.from("profiles").select("id, full_name, email, role, company:companies(name, is_internal)").eq("active", true).in("role", ["inspector", "admin"]).order("full_name");
  const r = o.requester || {}, oc = o.occupant || {}, a = o.access || {};

  return (
    <>
      <AdminHeader title={`Order ${o.ref}`} profile={profile} />
      <div className="shell" style={{ maxWidth: 1080 }}>
        <p className="hint"><a href="/admin/orders">← Orders</a></p>
        <div className="job-head">
          <div>
            <h2 style={{ margin: 0 }}>{o.property_address || o.ref}</h2>
            <p className="intro" style={{ margin: "6px 0 0" }}>{o.ref}{o.isn_order_number ? ` · ISN #${o.isn_order_number}` : ""} · {o.inspection_detail} · requested {fmt(o.requested_at)}</p>
          </div>
        </div>
        <div className="job-grid">
          <div>
            <section className="card">
              <h3 style={{ marginTop: 0 }}>Requested by</h3>
              <KV rows={[["Name", r.name], ["Company", r.company], ["Phone", r.phone && <a href={`tel:${r.phone}`}>{r.phone}</a>], ["Email", r.email && <a href={`mailto:${r.email}`}>{r.email}</a>], ["Address", r.address]]} />
              <p className="hint">This person receives the report and is responsible for payment before the inspection (via ISN).</p>
              {(o.report_copies || []).length > 0 && (<><h3>Report copies</h3><KV rows={(o.report_copies || []).map((c, i) => [`Copy ${i + 1}`, `${c.name ? c.name + " · " : ""}${c.email}`])} /></>)}
            </section>
            <section className="card" style={{ marginTop: 18 }}>
              <h3 style={{ marginTop: 0 }}>Home &amp; access</h3>
              <KV rows={[
                ["Property", o.property_address], ["Inspection", o.inspection_detail],
                ["Occupied", yn(oc.occupied)], ["Occupant", oc.name], ["Occupant phone", oc.phone && <a href={`tel:${oc.phone}`}>{oc.phone}</a>], ["Occupant email", oc.email],
                ["Occupant informed", oc.occupied ? yn(oc.informed) : ""],
                ...((oc.others || []).map((x, i) => [`Other occupant ${i + 1}`, [x.name, x.phone, x.email].filter(Boolean).join(" · ")])),
                ["Yard fenced", yn(a.fenced)], ["Locked gates", yn(a.lockedGates)], ["Dogs", yn(a.dogs)], ["Under-home access locked", yn(a.underHomeLocked)],
                ["Contractor lockbox", yn(a.lockbox)], ["Lockbox code", a.lockboxCode],
                ["Comments", o.comments],
              ]} />
            </section>
          </div>
          <aside>
            <section className="card">
              <OrderActions order={{ ref: o.ref, id: o.id, status: o.status, scheduledLocal: azInput(o.scheduled_at), inspectorId: o.inspector_id || "", notes: o.notes || "", isnNumber: o.isn_order_number || "", job: o.job }}
                people={(people || []).map((p) => ({ id: p.id, label: `${p.full_name || p.email}${p.company && !p.company.is_internal ? ` (${p.company.name})` : ""}` }))} />
            </section>
          </aside>
        </div>
      </div>
    </>
  );
}
