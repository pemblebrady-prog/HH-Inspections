"use client";
import { useEffect, useState } from "react";
import StatementList from "../../StatementList";

function lastMonth() {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function StatementsAdmin() {
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState("");
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch("/api/admin/people").then((r) => r.json()).then((d) => {
      if (d.ok) setCompanies((d.companies || []).filter((c) => !c.is_internal));
    }).catch(() => {});
  }, []);

  async function send(month, label, onlyCompany) {
    const who = onlyCompany ? (companies.find((c) => c.id === onlyCompany) || {}).name : "every company with jobs";
    if (!window.confirm(`Email the ${label} statement to ${who}?`)) return;
    setBusy(true); setErr(""); setReport(null);
    const d = await fetch("/api/admin/statements/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ month, companyId: onlyCompany || undefined }) })
      .then((r) => r.json()).catch((e) => ({ ok: false, error: String(e) }));
    setBusy(false);
    if (!d.ok) { setErr(d.error || "Couldn't send"); return; }
    setReport(d);
  }

  const lm = lastMonth();
  const lmLabel = new Date(Number(lm.slice(0, 4)), Number(lm.slice(5)) - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <>
      <section className="card">
        <h2>Monthly statements</h2>
        <p className="intro">Each company's owners get last month's statement by email automatically on the 1st. Use this page to view a statement or send one again.</p>
        <div className="field">
          <label htmlFor="co">Company</label>
          <select id="co" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
            <option value="">Choose a company</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        {companyId && <StatementList companyId={companyId} onSend={(m, label) => send(m, label, companyId)} />}
      </section>
      <section className="card" style={{ marginTop: 18 }}>
        <h2>Send to everyone</h2>
        <p className="intro">Email the {lmLabel} statement to every company that had jobs that month (the same thing the automatic send does).</p>
        <button className="btn ghost" type="button" disabled={busy} onClick={() => send(lm, lmLabel)}>{busy ? "Sending…" : `Send ${lmLabel} statements`}</button>
        {err && <p className="err">{err}</p>}
        {report && (
          <ul className="hint" style={{ marginTop: 12 }}>
            {report.companies.map((c) => <li key={c.company}>{c.company}: {c.skipped ? `skipped (${c.skipped})` : c.results.map((r) => `${r.to} ${r.ok ? "sent" : "not sent" + (r.error ? ` (${r.error})` : "")}`).join(", ")}</li>)}
          </ul>
        )}
      </section>
    </>
  );
}
