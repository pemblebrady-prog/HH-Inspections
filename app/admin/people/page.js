"use client";
import { useEffect, useState } from "react";
import AppHeader from "../../AppHeader";
import { SITE_ROLES, COMPANY_ROLES } from "../../../lib/roles";

// People: two layers of roles.
//   Site-wide (House & Home staff, admins only): Admin, Office manager, Engineer. No company needed.
//   Company role at one company: Company owner, Office manager, Inspector.
// Staff can also have a company role, but only at House & Home (e.g. Ron: Engineer + Inspector at House & Home).
// Layout (Brady, Nov 21): staff are listed once under Site-wide with just their site-wide role; every company
// role, House & Home's included, is listed under Company roles, so House & Home looks like any other company.
const BLANK = { email: "", fullName: "", siteRole: "", companyId: "", companyRole: "inspector", newCompany: "", sendEmail: true };

export default function People() {
  const [people, setPeople] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [me, setMe] = useState(null);
  const [canSite, setCanSite] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const set = (k) => (e) => setForm((s) => ({ ...s, [k]: e.target.value }));

  function apply(d) {
    if (!d.ok) { setErr(d.error || "Something went wrong"); return false; }
    setPeople(d.people || []); setCompanies(d.companies || []); if (d.me) setMe(d.me);
    if (d.canSiteRoles !== undefined) setCanSite(d.canSiteRoles); setErr("");
    return true;
  }
  useEffect(() => {
    fetch("/api/admin/people").then((r) => r.json()).then(apply).catch((e) => setErr(String(e)));
  }, []);

  const internal = companies.find((c) => c.is_internal);
  const coName = (id) => (companies.find((c) => c.id === id) || {}).name || "";

  // A company with no active owner yet (or a brand-new one): the first person is usually its owner.
  const needsOwner = (companyId) => {
    if (companyId === "__new") return true;
    const c = companies.find((x) => x.id === companyId);
    if (!c || c.is_internal) return false;
    return !(people || []).some((p) => p.company_id === companyId && p.company_role === "company_owner" && p.active);
  };
  const [roleTouched, setRoleTouched] = useState(false);
  function pickCompany(e) {
    const companyId = e.target.value;
    setForm((f) => ({ ...f, companyId, ...(!roleTouched && needsOwner(companyId) ? { companyRole: "company_owner" } : {}) }));
  }
  function pickSite(e) {
    const siteRole = e.target.value;
    setForm((f) => {
      const next = { ...f, siteRole };
      if (siteRole) {
        // Staff: no company, or House & Home only. Engineers default to Inspector at House & Home (their own jobs).
        if (f.companyId && f.companyId !== (internal && internal.id)) next.companyId = "";
        if (siteRole === "engineer" && internal && !next.companyId) { next.companyId = internal.id; next.companyRole = "inspector"; }
      }
      return next;
    });
  }
  const ownerHint = !form.siteRole && form.companyId && needsOwner(form.companyId);
  const companyChoices = form.siteRole ? companies.filter((c) => c.is_internal) : companies;

  async function invite(e) {
    e.preventDefault();
    setBusy(true); setMsg(""); setErr("");
    const d = await fetch("/api/admin/people", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, companyId: form.companyId === "__new" ? "" : form.companyId, companyRole: form.companyId ? form.companyRole : "" }),
    }).then((r) => r.json()).catch((e) => ({ ok: false, error: String(e) }));
    setBusy(false);
    if (apply(d)) {
      setMsg(d.skipped ? `Added ${form.email}. No email was sent; they can sign in at this portal with their email whenever you're ready.`
        : d.emailed ? `Invited ${form.email} and sent them a welcome email.`
        : `Added ${form.email}. The welcome email didn't send, so tell them to sign in at this portal with their email.`);
      setForm(BLANK); setRoleTouched(false);
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
  const staff = shown.filter((p) => p.site_role);
  // Everyone with a company role (staff too, e.g. Ron as an inspector at House & Home), plus anyone with no role at all.
  const byCompany = (a, b) => (coName(a.company_id) || "~").localeCompare(coName(b.company_id) || "~") || (a.full_name || a.email).localeCompare(b.full_name || b.email);
  const others = shown.filter((p) => p.company_id || !p.site_role).sort(byCompany);

  const statusCell = (p, locked) => (
    <td>
      {p.id === me ? "Active" : locked ? (p.active ? "Active" : "Deactivated") : (
        <button className="viewswitch" onClick={() => {
          if (!p.active || window.confirm(`Deactivate ${p.email}? They'll be signed out and can't sign in until reactivated.`)) {
            update(p.id, { active: !p.active });
          }
        }}>{p.active ? "Deactivate" : "Reactivate"}</button>
      )}
    </td>
  );
  const companyRoleSelect = (p, disabled) => (
    <select style={{ minWidth: 150 }} value={p.company_role || ""} disabled={disabled || !p.company_id} onChange={(e) => update(p.id, { companyRole: e.target.value })} aria-label={`Company role for ${p.email}`}>
      {!p.company_id && <option value="">None</option>}
      {COMPANY_ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
  const siteSelect = (p) => (
    <select value={p.site_role || ""} disabled={p.id === me && p.site_role === "admin"} onChange={(e) => update(p.id, { siteRole: e.target.value })} aria-label={`Site-wide role for ${p.email}`}>
      <option value="">None</option>
      {SITE_ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );

  return (
    <>
      <AppHeader title="People" wide />

      <div className="shell" style={{ maxWidth: 1080 }}>
        <section className="card">
          <h2>Invite someone</h2>
          <p className="intro">They'll get an email with a link to sign in. Give them a role at their company: inspectors submit jobs; office managers and owners also see the company's jobs and billing and invite inspectors.
            {canSite && " House & Home staff get a site-wide role instead (or as well): admins see everything; office managers run orders, people, companies and money; engineers review and certify."}</p>
          <form onSubmit={invite}>
            <div className="grid2">
              <div className="field"><label className="req" htmlFor="email">Email</label>
                <input id="email" type="email" value={form.email} onChange={set("email")} required /></div>
              <div className="field"><label htmlFor="fullName">Full name</label>
                <input id="fullName" value={form.fullName} onChange={set("fullName")} /></div>
              {canSite && (
                <div className="field"><label htmlFor="siteRole">Site-wide role (House &amp; Home staff)</label>
                  <select id="siteRole" value={form.siteRole} onChange={pickSite}>
                    <option value="">None</option>
                    {SITE_ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select></div>
              )}
              <div className="field"><label htmlFor="companyId" className={form.siteRole ? "" : "req"}>Company</label>
                <select id="companyId" value={form.companyId} onChange={pickCompany}>
                  <option value="">{form.siteRole ? "None" : "Choose a company"}</option>
                  {companyChoices.map((c) => <option key={c.id} value={c.id}>{c.name}{c.is_internal ? " (House & Home)" : ""}</option>)}
                  {!form.siteRole && <option value="__new">+ New company…</option>}
                </select>
                {form.siteRole && <div className="hint">Staff can only have a company role at House &amp; Home.</div>}</div>
              {form.companyId && (
                <div className="field"><label htmlFor="companyRole">Role at the company</label>
                  <select id="companyRole" value={form.companyRole} onChange={(e) => { setRoleTouched(true); set("companyRole")(e); }}>
                    {COMPANY_ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select></div>
              )}
              {form.companyId === "__new" && (
                <div className="field"><label className="req" htmlFor="newCompany">New company name</label>
                  <input id="newCompany" value={form.newCompany} onChange={set("newCompany")} placeholder="e.g. StarCrest Inspections" /></div>
              )}
            </div>
            {ownerHint && (form.companyRole === "company_owner"
              ? <p className="hint" style={{ marginTop: 0 }}>This company has no owner yet, so they'll be its <b>owner</b>: they set up billing and invite their own team. They can still submit jobs themselves.</p>
              : <p className="warnbox" style={{ marginTop: 0 }}>This company has no owner yet. The first person is usually the owner (sets up billing, invites the team, and can still inspect).{" "}
                  <button type="button" className="linklike" onClick={() => setForm((f) => ({ ...f, companyRole: "company_owner" }))}>Make them the owner</button></p>)}
            <label className="hint" style={{ display: "flex", gap: 8, alignItems: "center", margin: "0 0 14px" }}>
              <input type="checkbox" checked={form.sendEmail} onChange={(e) => setForm((f) => ({ ...f, sendEmail: e.target.checked }))} style={{ width: "auto" }} />
              Send them a welcome email
            </label>
            {err && <p className="err">{err}</p>}
            {msg && <p className="ok-msg">{msg}</p>}
            <button className="btn" type="submit" disabled={busy}>{busy ? (form.sendEmail ? "Inviting…" : "Adding…") : form.sendEmail ? "Send invite" : "Add without emailing"}</button>
          </form>
        </section>

        <div className="track-head">
          <h2>{canSite ? "Site-wide (House & Home staff)" : "People"}</h2>
          <label className="hint" style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Show deactivated
          </label>
        </div>
        {!people && !err && <div className="card"><p className="intro">Loading…</p></div>}

        {people && canSite && (
          <div className="table-wrap" style={{ marginBottom: 26 }}>
            <table className="track">
              <thead><tr><th>Name</th><th>Email</th><th>Site-wide role</th><th>Status</th></tr></thead>
              <tbody>
                {staff.map((p) => (
                  <tr key={p.id} style={p.active ? null : { opacity: 0.55 }}>
                    <td>{p.full_name || "—"}{p.id === me ? " (you)" : ""}{p.site_role === "engineer" && <div><a className="hint" href={`/admin/engineer?id=${p.id}`}>PE details →</a></div>}</td>
                    <td>{p.email}</td>
                    <td>{siteSelect(p)}{!p.company_id && internal && (
                      <div><button type="button" className="linklike hint" onClick={() => update(p.id, { companyId: internal.id, companyRole: "inspector" })}>+ Add a role at {internal.name}</button></div>
                    )}</td>
                    {statusCell(p)}
                  </tr>
                ))}
                {!staff.length && <tr><td colSpan={4} className="hint">No site-wide roles yet.</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {people && (
          <>
            {canSite && <div className="track-head"><h2>Company roles</h2></div>}
            <div className="table-wrap">
              <table className="track">
                <thead><tr><th>Name</th><th>Email</th><th>Company</th><th>Role</th><th>Status</th></tr></thead>
                <tbody>
                  {(canSite ? others : [...shown].sort(byCompany)).map((p) => {
                    const isStaff = Boolean(p.site_role);
                    const locked = !canSite && isStaff; // office managers can't change staff
                    return (
                      <tr key={p.id} style={p.active ? null : { opacity: 0.55 }}>
                        <td>{p.full_name || "—"}{p.id === me ? " (you)" : ""}</td>
                        <td>{p.email}</td>
                        <td>
                          <select value={p.company_id || ""} disabled={locked} onChange={(e) => update(p.id, { companyId: e.target.value })} aria-label={`Company for ${p.email}`}>
                            <option value="">None</option>
                            {(isStaff ? companies.filter((c) => c.is_internal) : companies).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        </td>
                        <td>{companyRoleSelect(p, locked && p.site_role === "admin")}</td>
                        {statusCell(p, locked || (canSite && isStaff))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
        {people && <p className="hint">{(people || []).filter((p) => p.active).length} active · {companies.length} companies{internal ? ` · staff can only have a company role at ${coName(internal.id)}` : ""}</p>}
      </div>
    </>
  );
}
