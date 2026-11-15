"use client";
import { useEffect, useState } from "react";

const LABEL = { engineer: "Engineer", company_owner: "Company owner", inspector: "Inspector" };

async function call(method, body) {
  return fetch("/api/view-as", { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined })
    .then((r) => r.json()).catch((e) => ({ ok: false, error: String(e) }));
}

export async function switchBack() {
  const d = await call("DELETE");
  window.location.assign(d.go || "/admin/review");
}

// In the profile menu, for admins: preview the portal as another role.
export function ViewAsPicker({ current }) {
  const [role, setRole] = useState(current ? current.role : "company_owner");
  const [companies, setCompanies] = useState(null);
  const [companyId, setCompanyId] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    call("GET").then((d) => { if (d.ok) { setCompanies(d.companies); if (d.companies[0]) setCompanyId((v) => v || d.companies[0].id); } else setErr(d.error || ""); });
  }, []);
  const needsCompany = role !== "engineer";
  async function go() {
    setBusy(true); setErr("");
    const d = await call("POST", { role, companyId: needsCompany ? companyId : undefined });
    if (!d.ok) { setBusy(false); setErr(d.error || "Couldn't switch"); return; }
    window.location.assign(d.go || "/");
  }
  return (
    <div className="um-viewas">
      <b>View as</b>
      <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role to preview">
        {Object.entries(LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      {needsCompany && (
        companies && companies.length === 0 ? <span className="hint">Add a company first.</span> :
        <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} aria-label="Company" disabled={!companies}>
          {!companies && <option>Loading…</option>}
          {(companies || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      )}
      <button type="button" className="btn" disabled={busy || (needsCompany && !companyId)} onClick={go}>{busy ? "Switching…" : "Preview"}</button>
      {current && <button type="button" className="viewswitch" onClick={switchBack}>Switch back to admin</button>}
      {err && <span className="err">{err}</span>}
      <span className="hint">Look only: nothing can be saved, charged or emailed while previewing.</span>
    </div>
  );
}

// Banner shown on every page while previewing.
export function ViewAsBanner({ viewingAs }) {
  if (!viewingAs) return null;
  return (
    <div className="viewas-banner" role="status">
      <span>Previewing as <b>{LABEL[viewingAs.role]}</b>{viewingAs.companyName ? <> · {viewingAs.companyName}</> : null}. Changes are turned off.</span>
      <button type="button" onClick={switchBack}>Switch back to admin</button>
    </div>
  );
}
