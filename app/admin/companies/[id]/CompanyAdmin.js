"use client";
import { useEffect, useState } from "react";
import { StatusPill } from "../../../../lib/statusLabels";
import StatementList from "../../../StatementList";
import { OnOff } from "../CompaniesAdmin";
import { normalizeLogo } from "../../../../lib/formConfig";

const money = (c) => `$${(Number(c || 0) / 100).toFixed(Number(c) % 100 ? 2 : 0)}`;
const day = (iso) => (iso ? new Date(iso.length === 10 ? iso + "T12:00:00" : iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Phoenix" }) : "—");
const api = (url, opts) => fetch(url, opts).then((r) => r.json()).catch((e) => ({ ok: false, error: String(e) }));
const json = (method, body) => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const ROLE = { admin: "Admin", company_owner: "Company owner", inspector: "Inspector" };
const PAY = { paid: "Paid", processing: "Processing", failed: "Failed", unpaid: "Not charged", waived: "No charge", refunded: "Refunded" };

export default function CompanyAdmin({ id }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const load = () => api(`/api/admin/companies/${id}`).then((r) => (r.ok ? setD(r) : setErr(r.error || "Couldn't load")));
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function patch(body, okMsg) {
    setMsg(""); setErr("");
    const r = await api(`/api/admin/companies/${id}`, json("PATCH", body));
    if (!r.ok) { setErr(r.error || "Couldn't save"); return false; }
    setD(r); setMsg(okMsg); return true;
  }

  if (!d) return <div className="card">{err ? <p className="err">{err}</p> : <p className="hint">Loading…</p>}</div>;
  const c = d.company;
  const activePeople = d.people.filter((p) => p.active);

  return (
    <>
      <p style={{ margin: "0 0 10px" }}><a href="/admin/companies">← All companies</a></p>
      <section className="card">
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          {c.logo_drive_file_id && <img src={`/api/logo?id=${encodeURIComponent(c.logo_drive_file_id)}`} alt="" style={{ maxHeight: 48, maxWidth: 160 }} />}
          <h2 style={{ margin: 0 }}>{c.name}</h2>
          <OnOff on={c.active} />
          {c.is_internal && <span className="pill" style={{ color: "#2C6E8C", background: "#e7f1fb" }}>House &amp; Home</span>}
        </div>
        <div className="track-stats" style={{ marginTop: 14, flexWrap: "wrap" }}>
          <span><b>{d.totals.jobs}</b> jobs</span>
          <span><b>{money(d.totals.paid)}</b> paid</span>
          {d.totals.processing > 0 && <span><b>{money(d.totals.processing)}</b> processing</span>}
          {d.totals.failed > 0 && <span style={{ color: "var(--err)" }}><b style={{ color: "inherit" }}>{d.totals.failed}</b> failed payments</span>}
          <span><b>{activePeople.length}</b> people</span>
        </div>
        {msg && <p className="ok-msg" style={{ marginTop: 12 }}>{msg}</p>}
        {err && <p className="err" style={{ marginTop: 12 }}>{err}</p>}
      </section>

      <div className="grid2" style={{ gap: 18, marginTop: 18, alignItems: "start" }}>
        {!c.is_internal && <PriceCard c={c} def={d.defaultPriceCents} onSave={patch} />}
        {!c.is_internal && <StatusCard c={c} people={activePeople.length} onSave={patch} />}
        {!c.is_internal && <PaymentCard c={c} />}
        <DetailsCard key={c.id + (c.logo_drive_file_id || "")} c={c} onSave={patch} onLogo={(r) => { setD(r); setMsg("Logo saved."); }} />
      </div>

      <section className="card" style={{ marginTop: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <h2>People</h2><a href="/admin/people">Invite or change people →</a>
        </div>
        {d.people.length === 0 ? <p className="hint">No one at this company yet. Invite the owner from People.</p> : (
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table className="track">
              <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>AZ cert #</th><th>Status</th></tr></thead>
              <tbody>{d.people.map((p) => (
                <tr key={p.id} style={p.active ? undefined : { opacity: 0.55 }}>
                  <td>{p.full_name || "—"}</td><td>{p.email}</td><td>{p.phone || "—"}</td><td>{ROLE[p.role] || p.role}</td><td>{p.certificate_number || "—"}</td><td>{p.active ? "Active" : "Deactivated"}</td>
                </tr>))}</tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card" style={{ marginTop: 18 }}>
        <h2>Jobs</h2>
        {d.jobs.length === 0 ? <p className="hint">No jobs yet.</p> : (
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table className="track">
              <thead><tr><th>Job</th><th>Submitted</th><th>Property</th><th>Client</th><th>Inspector</th><th>Status</th><th>Payment</th></tr></thead>
              <tbody>{d.jobs.map((j) => (
                <tr key={j.id}>
                  <td><a href={`/admin/review/${encodeURIComponent(j.ref)}`}>{j.ref}</a></td>
                  <td>{day(j.submitted_at)}</td><td>{j.property_address}</td><td>{j.client_name}</td><td>{j.inspector_name}</td>
                  <td><StatusPill status={j.status} /></td>
                  <td style={j.payment_status === "failed" ? { color: "var(--err)" } : undefined}>{PAY[j.payment_status] || j.payment_status}{j.amount_cents && j.payment_status !== "waived" ? ` · ${money(j.amount_cents)}` : ""}</td>
                </tr>))}</tbody>
            </table>
          </div>
        )}
        {d.jobs.length >= 200 && <p className="hint">Showing the latest 200 jobs.</p>}
      </section>

      {!c.is_internal && (
        <section className="card" style={{ marginTop: 18 }}>
          <h2>Monthly statements</h2>
          <StatementList companyId={c.id} />
        </section>
      )}
    </>
  );
}

function PriceCard({ c, def, onSave }) {
  const [custom, setCustom] = useState(c.price_cents != null);
  const [val, setVal] = useState(c.price_cents != null ? (c.price_cents / 100).toFixed(c.price_cents % 100 ? 2 : 0) : "");
  const [busy, setBusy] = useState(false);
  const dirty = custom !== (c.price_cents != null) || (custom && Math.round(Number(val.replace("$", "")) * 100) !== c.price_cents);
  const valid = !custom || /^\$?\d+(\.\d{1,2})?$/.test(val.trim());
  async function save() {
    setBusy(true);
    const ok = await onSave({ price: custom ? val : "" }, custom ? `Custom price set to $${val.replace("$", "")}.` : `Now using the default price (${money(def)}).`);
    setBusy(false);
    if (ok && !custom) setVal("");
  }
  return (
    <section className="card">
      <h2>Price per job</h2>
      <p style={{ fontSize: "1.6rem", fontWeight: 800, margin: "8px 0 4px" }}>{money(c.effective_price_cents)}</p>
      <p className="hint" style={{ marginTop: 0, marginBottom: 14 }}>{c.price_cents == null ? "Uses the default price." : `Custom price (default is ${money(def)}).`}</p>
      <div className="chips" style={{ marginBottom: 12 }}>
        <button type="button" className={"chip" + (!custom ? " on" : "")} onClick={() => setCustom(false)}>Use default ({money(def)})</button>
        <button type="button" className={"chip" + (custom ? " on" : "")} onClick={() => setCustom(true)}>Custom price</button>
      </div>
      {custom && (
        <div className="field"><label htmlFor="price">Custom price ($)</label>
          <input id="price" inputMode="decimal" value={val} onChange={(e) => setVal(e.target.value)} style={{ width: 140 }} placeholder={(def / 100).toFixed(0)} />
          {!valid && val && <div className="err">Enter a price like 150 or 150.00.</div>}</div>
      )}
      <button type="button" className="btn" disabled={!dirty || !valid || (custom && !val.trim()) || busy} onClick={save}>{busy ? "Saving…" : "Save price"}</button>
      <p className="hint">Applies to jobs submitted from now on. Let the owner know: they agreed to the per-job price when they saved their payment method.</p>
    </section>
  );
}

function StatusCard({ c, people, onSave }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  async function go(active) {
    setBusy(true);
    await onSave({ active }, active ? `${c.name} is back on. Its people can sign in again.` : `${c.name} is turned off.`);
    setBusy(false); setConfirming(false);
  }
  return (
    <section className="card">
      <h2>Status</h2>
      {c.active ? (
        <>
          <p className="intro" style={{ marginBottom: 14 }}>On. The company's people can sign in and submit jobs.</p>
          {!confirming ? <button type="button" className="btn ghost" onClick={() => setConfirming(true)}>Turn off this company</button> : (
            <div role="alert" style={{ padding: 16, border: "1px solid #e2b9b2", background: "#fbebeb", borderRadius: 8 }}>
              <p style={{ fontWeight: 700, marginBottom: 6 }}>Turn off {c.name}?</p>
              <p style={{ marginBottom: 12 }}>Its {people} {people === 1 ? "person" : "people"} won't be able to sign in or submit jobs. Their jobs, letters and payment records are kept, and you can turn it back on anytime.</p>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button type="button" className="btn" onClick={() => go(false)} disabled={busy}>{busy ? "Turning off…" : "Yes, turn it off"}</button>
                <button type="button" className="btn ghost" onClick={() => setConfirming(false)} disabled={busy}>Cancel</button>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <p className="intro" style={{ marginBottom: 14 }}>Off since {day(c.deactivated_at)}. Nobody at this company can sign in or submit.</p>
          <button type="button" className="btn" onClick={() => go(true)} disabled={busy}>{busy ? "Turning on…" : "Turn it back on"}</button>
        </>
      )}
    </section>
  );
}

function PaymentCard({ c }) {
  return (
    <section className="card">
      <h2>Payment method</h2>
      {c.payment_ready_at ? (
        <>
          <p style={{ fontWeight: 600, margin: "10px 0 4px" }}>{c.payment_method_label || "On file"}</p>
          <p className="hint" style={{ marginTop: 0 }}>{c.default_payment === "ach" ? "Bank account (ACH)" : c.default_payment === "card" ? "Card" : ""}{c.default_payment ? " · " : ""}ready since {day(c.payment_ready_at)}</p>
        </>
      ) : <p style={{ margin: "10px 0 4px", color: "var(--err)", fontWeight: 600 }}>None on file yet</p>}
      {c.payment_status_note && <p className="hint">{c.payment_status_note}</p>}
      <p className="hint">The company owner adds or changes it on their Billing page.</p>
    </section>
  );
}

function DetailsCard({ c, onSave, onLogo }) {
  const [f, setF] = useState({
    phone: c.phone || "", email: c.email || "", billingContact: c.billing_contact || "",
    billingAddress: c.billing_address || "", billingCity: c.billing_city || "", billingState: c.billing_state || "AZ", billingZip: c.billing_zip || "",
  });
  const [busy, setBusy] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoErr, setLogoErr] = useState("");
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  async function save(e) { e.preventDefault(); setBusy(true); await onSave({ details: f }, "Company details saved."); setBusy(false); }
  async function logo(e) {
    const file = e.target.files && e.target.files[0]; if (!file) return;
    setLogoBusy(true); setLogoErr("");
    const fd = new FormData(); fd.append("logo", await normalizeLogo(file));
    const r = await api(`/api/admin/companies/${c.id}`, { method: "POST", body: fd });
    setLogoBusy(false);
    if (!r.ok) setLogoErr(r.error || "Couldn't save the logo"); else onLogo(r);
  }
  const inp = (k, label, props = {}) => (
    <div className="field" style={{ marginBottom: 12 }}><label htmlFor={`co-${k}`}>{label}</label><input id={`co-${k}`} value={f[k]} onChange={set(k)} {...props} /></div>
  );
  return (
    <section className="card">
      <h2>Details</h2>
      <form onSubmit={save} style={{ marginTop: 12 }}>
        <div className="grid2">{inp("phone", "Phone", { type: "tel" })}{inp("email", "Email", { type: "email" })}</div>
        {inp("billingContact", "Billing contact")}
        {inp("billingAddress", "Billing address")}
        <div className="row c3" style={{ gap: 12 }}>{inp("billingCity", "City")}{inp("billingState", "State")}{inp("billingZip", "ZIP", { inputMode: "numeric" })}</div>
        <div className="field" style={{ marginBottom: 12 }}><label htmlFor="co-logo">Logo (shown on letters)</label>
          <input id="co-logo" type="file" accept="image/*" onChange={logo} disabled={logoBusy} />
          {logoBusy && <div className="hint">Uploading…</div>}{logoErr && <div className="err">{logoErr}</div>}</div>
        <button className="btn" disabled={busy}>{busy ? "Saving…" : "Save details"}</button>
        <p className="hint">The company name can't be changed here yet, because letters look up the logo by name.</p>
      </form>
    </section>
  );
}
