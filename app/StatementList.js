"use client";
import { useEffect, useState } from "react";

// Months with activity, each linking to its printable statement.
export default function StatementList({ companyId, onSend }) {
  const [months, setMonths] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    setMonths(null); setErr("");
    fetch("/api/statements/months" + (companyId ? `?company=${encodeURIComponent(companyId)}` : ""))
      .then((r) => r.json()).then((d) => (d.ok ? setMonths(d.months) : setErr(d.error || "Couldn't load")))
      .catch((e) => setErr(String(e)));
  }, [companyId]);
  if (err) return <p className="err">{err}</p>;
  if (!months) return <p className="hint">Loading…</p>;
  if (!months.length) return <p className="hint">No activity yet. Statements appear here once jobs are submitted.</p>;
  const q = companyId ? `&company=${encodeURIComponent(companyId)}` : "";
  return (
    <ul className="month-list">
      {months.map((m) => (
        <li key={m.month}>
          <a href={`/statement?month=${m.month}${q}`}>{m.label}</a>
          {onSend && <button type="button" className="viewswitch" onClick={() => onSend(m.month, m.label)}>Email it</button>}
        </li>
      ))}
    </ul>
  );
}
