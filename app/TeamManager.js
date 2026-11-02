"use client";
import { useEffect, useState } from "react";

// Company owner's view of their inspectors, with an invite form.
export default function TeamManager({ compact }) {
  const [team, setTeam] = useState(null);
  const [me, setMe] = useState(null);
  const [form, setForm] = useState({ email: "", fullName: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  function apply(d) {
    if (!d.ok) { setErr(d.error || "Something went wrong"); return false; }
    setTeam(d.team || []); if (d.me) setMe(d.me); setErr(""); return true;
  }
  useEffect(() => { fetch("/api/team").then((r) => r.json()).then(apply).catch((e) => setErr(String(e))); }, []);

  async function invite(e) {
    e.preventDefault(); setBusy(true); setErr(""); setMsg("");
    const d = await fetch("/api/team", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) })
      .then((r) => r.json()).catch((e) => ({ ok: false, error: String(e) }));
    setBusy(false);
    if (apply(d)) {
      setMsg(d.emailed ? `Invited ${form.email}. They'll get an email to sign in.` : `Added ${form.email}. The email didn't send, so tell them to sign in at the portal with their email.`);
      setForm({ email: "", fullName: "" });
    }
  }
  async function toggle(p) {
    if (p.active && !window.confirm(`Deactivate ${p.email}? They won't be able to sign in until you reactivate them.`)) return;
    const d = await fetch("/api/team", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: p.id, active: !p.active }) })
      .then((r) => r.json()).catch((e) => ({ ok: false, error: String(e) }));
    apply(d);
  }

  return (
    <div>
      <form onSubmit={invite}>
        <div className="grid2">
          <div className="field"><label className="req" htmlFor="tm-email">Inspector's email</label>
            <input id="tm-email" type="email" value={form.email} onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))} required /></div>
          <div className="field"><label htmlFor="tm-name">Full name</label>
            <input id="tm-name" value={form.fullName} onChange={(e) => setForm((s) => ({ ...s, fullName: e.target.value }))} /></div>
        </div>
        {err && <p className="err">{err}</p>}
        {msg && <p className="ok-msg">{msg}</p>}
        <button className="btn ghost" type="submit" disabled={busy}>{busy ? "Inviting…" : "Invite inspector"}</button>
      </form>

      {team && team.length > 0 && (
        <div className="table-wrap" style={{ marginTop: 18 }}>
          <table className="track">
            <thead><tr><th>Name</th><th>Email</th>{!compact && <th>Status</th>}<th></th></tr></thead>
            <tbody>
              {team.map((p) => (
                <tr key={p.id} style={p.active ? null : { opacity: 0.55 }}>
                  <td>{p.full_name || "—"}{p.id === me ? " (you)" : ""}{p.role === "company_owner" ? " · Owner" : ""}</td>
                  <td>{p.email}</td>
                  {!compact && <td>{!p.active ? "Deactivated" : p.onboarded_at ? "Set up" : "Invited"}</td>}
                  <td>{p.role === "inspector" && <button className="viewswitch" type="button" onClick={() => toggle(p)}>{p.active ? "Deactivate" : "Reactivate"}</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
