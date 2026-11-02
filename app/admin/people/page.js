"use client";
import { useEffect, useState } from "react";
import AppHeader from "../../AppHeader";

const ROLE_LABEL = { admin: "Admin", company_owner: "Company owner", inspector: "Inspector" };
const BLANK = { email: "", fullName: "", role: "inspector", companyId: "", newCompany: "" };

export default function People() {
  const [people, setPeople] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [me, setMe] = useState(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const set = (k) => (e) => setForm((s) => ({ ...s, [k]: e.target.value }));

  function apply(d) {
    if (!d.ok) { setErr(d.error || "Something went wrong"); return false; }
    setPeople(d.people || []); setCompanies(d.companies || []); if (d.me) setMe(d.me); setErr("");
    return true;
  }
  useEffect(() => {
    fetch("/api/admin/people").then((r) => r.json()).then(apply).catch((e) => setErr(String(e)));
  }, []);

  async function invite(e) {
    e.preventDefault();
    setBusy(true); setMsg(""); setErr("");
    const d = await fetch("/api/admin/people", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "invite", ...form, companyId: form.companyId === "__new" ? "" : form.companyId }),
    }).then((r) => r.json()).catch((e) => ({ ok: false, error: String(e) }));
    setBusy(false);
    if (apply(d)) {
      setMsg(d.emailed ? `Invited ${form.email} and sent them a welcome email.`
        : `Added ${form.email}. The welcome email didn't send, so tell them to sign in at this portal with their email.`);
      setForm(BLANK);
    }
  }

  async function update(id, patch) {
    setErr(""); setMsg("");
    const d = await fetch("/api/admin/people", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...patch }),
    }).then((r) => r.json()).catch((e) => ({ ok: false, error: String(e) }));
    apply(d);
  }

  const shown = (people || []).filter((p) => showInactive || p.active);

  return (
    <>
      <AppHeader title="People" wide />

      <div className="shell" style={{ maxWidth: 1080 }}>
        <section className="card">
          <h2>Invite someone</h2>
          <p className="intro">They'll get an email with a link to sign in. Inspectors can submit jobs; company owners also see their company's jobs and billing; admins see everything.</p>
          <form onSubmit={invite}>
            <div className="grid2">
              <div className="field"><label className="req" htmlFor="email">Email</label>
                <input id="email" type="email" value={form.email} onChange={set("email")} required /></div>
              <div className="field"><label htmlFor="fullName">Full name</label>
                <input id="fullName" value={form.fullName} onChange={set("fullName")} /></div>
              <div className="field"><label htmlFor="role">Role</label>
                <select id="role" value={form.role} onChange={set("role")}>
                  <option value="inspector">Inspector</option>
                  <option value="company_owner">Company owner</option>
                  <option value="admin">Admin (House &amp; Home staff)</option>
                </select></div>
              <div className="field"><label htmlFor="companyId" className={form.role === "admin" ? "" : "req"}>Company</label>
                <select id="companyId" value={form.companyId} onChange={set("companyId")}>
                  <option value="">{form.role === "admin" ? "None" : "Choose a company"}</option>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.name}{c.is_internal ? " (House & Home)" : ""}</option>)}
                  <option value="__new">+ New company…</option>
                </select></div>
              {form.companyId === "__new" && (
                <div className="field"><label className="req" htmlFor="newCompany">New company name</label>
                  <input id="newCompany" value={form.newCompany} onChange={set("newCompany")} placeholder="e.g. StarCrest Inspections" /></div>
              )}
            </div>
            {err && <p className="err">{err}</p>}
            {msg && <p className="ok-msg">{msg}</p>}
            <button className="btn" type="submit" disabled={busy}>{busy ? "Inviting…" : "Send invite"}</button>
          </form>
        </section>

        <div className="track-head">
          <h2>Everyone</h2>
          <label className="hint" style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Show deactivated
          </label>
        </div>
        {!people && !err && <div className="card"><p className="intro">Loading…</p></div>}
        {people && (
          <div className="table-wrap">
            <table className="track">
              <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Company</th><th>Status</th></tr></thead>
              <tbody>
                {shown.map((p) => (
                  <tr key={p.id} style={p.active ? null : { opacity: 0.55 }}>
                    <td>{p.full_name || "—"}{p.id === me ? " (you)" : ""}</td>
                    <td>{p.email}</td>
                    <td>
                      <select value={p.role} disabled={p.id === me} onChange={(e) => update(p.id, { role: e.target.value })}>
                        {Object.entries(ROLE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </td>
                    <td>
                      <select value={p.company_id || ""} onChange={(e) => update(p.id, { companyId: e.target.value })}>
                        <option value="">None</option>
                        {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </td>
                    <td>
                      {p.id === me ? "Active" : (
                        <button className="viewswitch" onClick={() => {
                          if (!p.active || window.confirm(`Deactivate ${p.email}? They'll be signed out and can't sign in until reactivated.`)) {
                            update(p.id, { active: !p.active });
                          }
                        }}>{p.active ? "Deactivate" : "Reactivate"}</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {people && <p className="hint">{(people || []).filter((p) => p.active).length} active · {companies.length} companies</p>}
      </div>
    </>
  );
}
