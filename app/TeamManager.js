"use client";
import { useEffect, useState } from "react";

// Company owner's (or office manager's) view of their people, with an invite form.
// Owners can also make someone an office manager: they see jobs and billing and can invite inspectors.
export default function TeamManager({ compact }) {
  const [team, setTeam] = useState(null);
  const [me, setMe] = useState(null);
  const [form, setForm] = useState({ email: "", fullName: "", companyRole: "inspector" });
  const [owner, setOwner] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  function apply(d) {
    if (!d.ok) { setErr(d.error || "Something went wrong"); return false; }
    setTeam(d.team || []); if (d.me) setMe(d.me); if (d.owner !== undefined) setOwner(d.owner); setErr(""); return true;
  }
  useEffect(() => { fetch("/api/team").then((r) => r.json()).then(apply).catch((e) => setErr(String(e))); }, []);

  async function invite(e) {
    e.preventDefault(); setBusy(true); setErr(""); setMsg("");
    const d = await fetch("/api/team", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) })
      .then((r) => r.json()).catch((e) => ({ ok: false, error: String(e) }));
    setBusy(false);
    if (apply(d)) {
      setMsg(d.emailed ? `Invited ${form.email}. They'll get an email to sign in.` : `Added ${form.email}. The email didn't send, so tell them to sign in at the portal with their email.`);
      setForm({ email: "", fullName: "", companyRole: "inspector" });
    }
  }
  async function toggle(p) {
    if (p.active && !window.confirm(`Deactivate ${p.email}? They won't be able to sign in until you reactivate them.`)) return;
    const d = await fetch("/api/team", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: p.id, active: !p.active }) })
      .then((r) => r.json()).catch((e) => ({ ok: false, error: String(e) }));
    apply(d);
  }
  async function setRole(p, companyRole) {
    const d = await fetch("/api/team", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: p.id, companyRole }) })
      .then((r) => r.json()).catch((e) => ({ ok: false, error: String(e) }));
    apply(d);
  }
  const canChange = (p) => p.id !== me && (p.role === "inspector" || (owner && p.role === "company_office"));

  return (
    <div>
      <form onSubmit={invite}>
        <div className="grid2">
          <div className="field"><label className="req" htmlFor="tm-email">Email</label>
            <input id="tm-email" type="email" value={form.email} onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))} required /></div>
          <div className="field"><label htmlFor="tm-name">Full name</label>
            <input id="tm-name" value={form.fullName} onChange={(e) => setForm((s) => ({ ...s, fullName: e.target.value }))} /></div>
        </div>
        {owner && (
          <div className="field" style={{ maxWidth: 320 }}><label htmlFor="tm-role">Role</label>
            <select id="tm-role" value={form.companyRole} onChange={(e) => setForm((s) => ({ ...s, companyRole: e.target.value }))}>
              <option value="inspector">Inspector</option><option value="office_manager">Office manager</option>
            </select>
            {form.companyRole === "office_manager" && <div className="hint">Office managers see company jobs and billing, invite inspectors, and can submit jobs.</div>}
          </div>
        )}
        {err && <p className="err">{err}</p>}
        {msg && <p className="ok-msg">{msg}</p>}
        <button className="btn ghost" type="submit" disabled={busy}>{busy ? "Inviting…" : form.companyRole === "office_manager" ? "Invite office manager" : "Invite inspector"}</button>
      </form>

      {team && team.length > 0 && (
        <div className="table-wrap" style={{ marginTop: 18 }}>
          <table className="track">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th>{!compact && <th>Status</th>}<th></th></tr></thead>
            <tbody>
              {team.map((p) => (
                <tr key={p.id} style={p.active ? null : { opacity: 0.55 }}>
                  <td>{p.full_name || "—"}{p.id === me ? " (you)" : ""}</td>
                  <td>{p.email}</td>
                  <td>{owner && canChange(p) && p.active
                    ? <select value={p.role === "company_office" ? "office_manager" : "inspector"} onChange={(e) => setRole(p, e.target.value)} aria-label={`Role for ${p.email}`}>
                        <option value="inspector">Inspector</option><option value="office_manager">Office manager</option></select>
                    : ({ company_owner: "Owner", company_office: "Office manager", inspector: "Inspector" }[p.role] || "Staff")}</td>
                  {!compact && <td>{!p.active ? "Deactivated" : p.onboarded_at ? "Set up" : "Invited"}</td>}
                  <td>{canChange(p) && <button className="viewswitch" type="button" onClick={() => toggle(p)}>{p.active ? "Deactivate" : "Reactivate"}</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
