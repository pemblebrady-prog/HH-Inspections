"use client";
import { useEffect, useState } from "react";

const money = (c) => `$${(Number(c || 0) / 100).toFixed(Number(c) % 100 ? 2 : 0)}`;
const day = (iso) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Phoenix" }) : "—");
const api = (url, opts) => fetch(url, opts).then((r) => r.json()).catch((e) => ({ ok: false, error: String(e) }));
const json = (method, body) => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export default function CompaniesAdmin() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [show, setShow] = useState("on");
  const load = () => api("/api/admin/companies").then((r) => (r.ok ? setD(r) : setErr(r.error || "Couldn't load")));
  useEffect(() => { load(); }, []);

  if (err) return <div className="card"><p className="err">{err}</p></div>;
  if (!d) return <div className="card"><p className="hint">Loading…</p></div>;

  const outside = d.companies.filter((c) => !c.is_internal);
  const onDefault = outside.filter((c) => c.price_cents == null && c.active).length;
  const list = d.companies
    .filter((c) => (show === "all" ? true : show === "off" ? !c.active : c.active))
    .filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <DefaultPrice cents={d.defaultPriceCents} affected={onDefault} onSaved={load} />

      <section className="card" style={{ marginTop: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 10 }}>
          <h2>Companies</h2>
          <AddCompany />
        </div>
        <div className="tabs" style={{ marginTop: 14 }}>
          {[["on", "On"], ["off", "Turned off"], ["all", "All"]].map(([k, label]) => (
            <button key={k} type="button" className={"tab" + (show === k ? " on" : "")} style={{ background: "none", border: 0, cursor: "pointer", font: "inherit" }} onClick={() => setShow(k)}>
              {label}{k === "off" && d.companies.some((c) => !c.active) ? <span className="count">{d.companies.filter((c) => !c.active).length}</span> : null}
            </button>
          ))}
          <input className="tab right" placeholder="Search companies" value={q} onChange={(e) => setQ(e.target.value)} style={{ border: "1px solid var(--line)", borderRadius: 6, padding: "6px 10px", marginBottom: 6 }} />
        </div>
        {list.length === 0 ? <p className="hint">No companies here.</p> : (
          <div className="table-wrap">
            <table className="track">
              <thead><tr><th>Company</th><th>Status</th><th>Price per job</th><th>Payment method</th><th>People</th><th>Jobs this month</th><th>All jobs</th><th>Last job</th></tr></thead>
              <tbody>
                {list.map((c) => (
                  <tr key={c.id} style={c.active ? undefined : { opacity: 0.6 }}>
                    <td><a href={`/admin/companies/${c.id}`} style={{ fontWeight: 600, color: "var(--ink)" }}>{c.name}</a>{c.is_internal && <div className="hint" style={{ marginTop: 0 }}>House &amp; Home</div>}</td>
                    <td><OnOff on={c.active} /></td>
                    <td>{c.is_internal ? "No charge" : c.price_cents == null ? <>{money(c.effective_price_cents)} <span className="hint">default</span></> : <><b>{money(c.price_cents)}</b> <span className="hint">custom</span></>}</td>
                    <td>{c.is_internal ? "—" : c.pay_per_job ? "Pays by card per job" : c.payment_ready_at ? c.payment_method_label || "On file" : <span style={{ color: "var(--err)" }}>None yet</span>}
                      {c.failed_payments > 0 && <div className="err" style={{ marginTop: 2 }}>{c.failed_payments} failed</div>}</td>
                    <td>{c.people}</td>
                    <td>{c.jobs_this_month}</td>
                    <td>{c.jobs_total}</td>
                    <td>{day(c.last_job_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

export function OnOff({ on }) {
  return <span className="pill" style={on ? { color: "#3f7a52", background: "#e5f4e4" } : { color: "#A2382A", background: "#fbebeb" }}>{on ? "On" : "Off"}</span>;
}

function DefaultPrice({ cents, affected, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const start = () => { setVal((cents / 100).toFixed(cents % 100 ? 2 : 0)); setEditing(true); setConfirming(false); setErr(""); setMsg(""); };
  const valid = /^\$?\d+(\.\d{1,2})?$/.test(val.trim());
  async function save() {
    setBusy(true); setErr("");
    const r = await api("/api/admin/settings", json("PATCH", { defaultPrice: val, confirm: true }));
    setBusy(false);
    if (!r.ok) { setErr(r.error || "Couldn't save"); return; }
    setEditing(false); setConfirming(false); setMsg(`Default price is now ${money(r.defaultPriceCents)}.`); onSaved();
  }
  return (
    <section className="card">
      <h2>Default price</h2>
      <p className="intro" style={{ marginBottom: 12 }}>What each certification costs for every company that doesn't have a custom price. Set a custom price on a company's page.</p>
      {msg && <p className="ok-msg">{msg}</p>}
      {!editing ? (
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <span style={{ fontSize: "1.8rem", fontWeight: 800 }}>{money(cents)}</span><span className="hint" style={{ marginTop: 0 }}>per job · used by {affected} active {affected === 1 ? "company" : "companies"}</span>
          <button type="button" className="btn ghost" onClick={start}>Change</button>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div className="field" style={{ marginBottom: 0 }}><label htmlFor="defprice">New default price ($)</label>
              <input id="defprice" inputMode="decimal" value={val} onChange={(e) => { setVal(e.target.value); setConfirming(false); }} style={{ width: 140 }} disabled={confirming} /></div>
            {!confirming && <><button type="button" className="btn" disabled={!valid} onClick={() => setConfirming(true)}>Save</button>
              <button type="button" className="btn ghost" onClick={() => setEditing(false)}>Cancel</button></>}
          </div>
          {!valid && val && <p className="err">Enter a price like 135 or 135.00.</p>}
          {confirming && (
            <div role="alert" style={{ marginTop: 14, padding: 16, border: "1px solid #e2b9b2", background: "#fbebeb", borderRadius: 8 }}>
              <p style={{ fontWeight: 700, marginBottom: 6 }}>You are changing the default price, potentially impacting all inspectors.</p>
              <p style={{ marginBottom: 12 }}>
                {money(cents)} → <b>{money(Math.round(Number(val.replace("$", "")) * 100))}</b> for {affected} active {affected === 1 ? "company" : "companies"} without a custom price.
                It applies to jobs submitted from now on; jobs already submitted keep their price. Please confirm.
              </p>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button type="button" className="btn" onClick={save} disabled={busy}>{busy ? "Saving…" : "Yes, change the default price"}</button>
                <button type="button" className="btn ghost" onClick={() => setConfirming(false)} disabled={busy}>Go back</button>
              </div>
            </div>
          )}
          {err && <p className="err">{err}</p>}
        </>
      )}
    </section>
  );
}

function AddCompany() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function add(e) {
    e.preventDefault(); setBusy(true); setErr("");
    const r = await api("/api/admin/companies", json("POST", { name }));
    setBusy(false);
    if (!r.ok) { setErr(r.error || "Couldn't add"); return; }
    window.location.assign(`/admin/companies/${r.id}`);
  }
  if (!open) return <button type="button" className="btn ghost" onClick={() => setOpen(true)}>+ Add company</button>;
  return (
    <form onSubmit={add} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <input placeholder="Company name" value={name} onChange={(e) => setName(e.target.value)} autoFocus style={{ padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 6 }} />
      <button className="btn" disabled={busy || !name.trim()}>{busy ? "Adding…" : "Add"}</button>
      <button type="button" className="btn ghost" onClick={() => setOpen(false)}>Cancel</button>
      {err && <span className="err" style={{ width: "100%" }}>{err}</span>}
    </form>
  );
}
