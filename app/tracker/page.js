"use client";
import { useEffect, useState } from "react";

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso.length <= 10 ? iso + "T00:00:00" : iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}
function fmtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function Tracker() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    fetch("/api/submissions")
      .then((r) => r.json())
      .then((d) => { if (d.ok) setRows(d.records || []); else setErr(d.error || "Could not load"); })
      .catch((e) => setErr(String(e)));
  }, []);

  const total = rows ? rows.reduce((a, r) => a + (Number(r.amountPaid) || 0), 0) : 0;

  return (
    <>
      <header><div className="bar">
        <a className="brand" href="/"><b>House&nbsp;<span>&amp;</span>&nbsp;Home</b><span className="sub">Submission Tracker</span></a>
        <div className="who"><span className="mono">Internal</span></div>
      </div></header>

      <div className="shell" style={{ maxWidth: 1080 }}>
        <div className="track-head">
          <h2>All submissions</h2>
          {rows && <div className="track-stats"><span><b>{rows.length}</b> submission{rows.length === 1 ? "" : "s"}</span><span><b>${total.toLocaleString("en-US", { minimumFractionDigits: 2 })}</b> collected</span></div>}
        </div>

        {err && <div className="card"><p className="err">Couldn't load submissions: {err}</p></div>}
        {!rows && !err && <div className="card"><p className="intro">Loading…</p></div>}
        {rows && rows.length === 0 && <div className="card"><p className="intro">No submissions yet. They'll appear here the moment an inspector submits.</p></div>}

        {rows && rows.length > 0 && (
          <div className="table-wrap">
            <table className="track">
              <thead>
                <tr>
                  <th>Inspector</th><th>Client</th><th>Address</th><th>Inspected</th><th>Submitted</th><th>Amount</th><th>Files</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.submissionId || i}>
                    <td>{r.inspectorName || "—"}</td>
                    <td>{r.clientName || "—"}</td>
                    <td>{r.propertyAddress || "—"}</td>
                    <td>{fmtDate(r.inspectionDate)}</td>
                    <td>{fmtDateTime(r.submittedAt)}</td>
                    <td>${(Number(r.amountPaid) || 0).toFixed(2)}</td>
                    <td>{r.driveLink ? <a href={r.driveLink} target="_blank" rel="noreferrer">Open ↗</a> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
