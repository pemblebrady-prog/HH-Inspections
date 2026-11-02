"use client";
import { useState } from "react";

const NEXT = {
  submitted:    [["start", "Start review", ""]],
  under_review: [["certify", "Mark certified", ""], ["reopen", "Back to queue", "ghost"]],
  certified:    [["reopen", "Reopen", "ghost"]],
  delivered:    [["reopen", "Reopen", "ghost"]],
  on_hold:      [["start", "Start review anyway", "ghost"]],
  canceled:     [["reopen", "Restore", "ghost"]],
};

export default function ReviewActions({ job }) {
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [notes, setNotes] = useState(job.review_notes);
  const [letter, setLetter] = useState(job.letter_link);
  const [to, setTo] = useState((job.recipients || []).join("\n"));
  const [results, setResults] = useState(null);
  const canSend = ["under_review", "certified", "delivered"].includes(job.status) && letter;

  async function send(force) {
    setBusy("send"); setErr(""); setMsg(""); setResults(null);
    const recipients = to.split(/[\s,;]+/).filter(Boolean);
    const d = await fetch("/api/admin/submissions", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ref: job.ref, action: "send", recipients, force }),
    }).then((r) => r.json()).catch((e) => ({ ok: false, error: String(e) }));
    setBusy("");
    if (d.needsConfirm) {
      if (window.confirm("This letter doesn't look final yet:\n\n- " + d.problems.join("\n- ") + "\n\nFix it in the Google Doc first (recommended), or send anyway?")) return send(true);
      return;
    }
    if (d.results) setResults(d.results);
    if (!d.ok) { setErr(d.error || "Couldn't send"); return; }
    setMsg("Final letter sent. The job is marked delivered.");
    setTimeout(() => window.location.reload(), 2500);
  }

  async function act(action, extra = {}) {
    setBusy(action); setErr(""); setMsg("");
    const d = await fetch("/api/admin/submissions", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ref: job.ref, action, ...extra }),
    }).then((r) => r.json()).catch((e) => ({ ok: false, error: String(e) }));
    setBusy("");
    if (!d.ok) { setErr(d.error || "Something went wrong"); return; }
    if (action === "letter") { setLetter(d.submission.letter_link); setMsg("New draft letter created."); return; }
    if (action === "notes") { setMsg("Notes saved."); return; }
    window.location.reload();
  }

  return (
    <div>
      <h3 style={{ marginTop: 0 }}>Actions</h3>
      <div className="stack">
        {letter
          ? <a className="btn" href={letter} target="_blank" rel="noreferrer">Open draft letter</a>
          : <p className="hint">No draft letter yet.</p>}
        <button className="btn ghost" type="button" disabled={!!busy} onClick={() => act("letter")}>
          {busy === "letter" ? "Making letter…" : letter ? "Regenerate letter" : "Make draft letter"}
        </button>
        {job.drive_link && <a className="btn ghost" href={job.drive_link} target="_blank" rel="noreferrer">Open Drive folder</a>}
        {canSend && (
          <div className="send-box">
            <b>{job.status === "delivered" ? "Send again" : "Send final letter"}</b>
            <p className="hint" style={{ margin: "4px 0 8px" }}>First add the PE stamp and signature in the Google Doc and delete the yellow DRAFT note. The letter is emailed as a PDF and saved to the Drive folder.</p>
            <label htmlFor="to" className="hint">Send to (one per line)</label>
            <textarea id="to" rows={3} value={to} onChange={(e) => setTo(e.target.value)} placeholder="client@example.com" />
            <button className="btn" type="button" disabled={!!busy} onClick={() => send(false)}>{busy === "send" ? "Sending…" : job.status === "delivered" ? "Send again" : "Send final letter"}</button>
            {job.final_pdf_link && <a className="hint" href={job.final_pdf_link} target="_blank" rel="noreferrer">Last sent PDF</a>}
          </div>
        )}
        <hr />
        {(NEXT[job.status] || []).map(([a, label, style]) => (
          <button key={a} className={"btn" + (style ? " " + style : "")} type="button" disabled={!!busy}
            onClick={() => { if (a !== "certify" || window.confirm("Mark this job certified? Do this after the signed letter is final.")) act(a); }}>
            {busy === a ? "Saving…" : label}
          </button>
        ))}
      </div>
      {["unpaid", "failed"].includes(job.payment_status) && (
        <div className="stack" style={{ marginTop: 12 }}>
          <p className="hint" style={{ margin: 0 }}>Payment: <b>{job.payment_status}</b></p>
          <button className="btn ghost" type="button" disabled={!!busy} onClick={() => act("charge")}>{busy === "charge" ? "Charging…" : "Charge payment method now"}</button>
          <button className="btn ghost" type="button" disabled={!!busy} onClick={() => { if (window.confirm("Waive the fee for this job?")) act("waive"); }}>{busy === "waive" ? "Saving…" : "Waive fee"}</button>
        </div>
      )}
      <div className="field" style={{ marginTop: 16 }}>
        <label htmlFor="notes">Internal notes</label>
        <textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Only admins see these." />
        <button className="viewswitch" type="button" style={{ marginTop: 6 }} disabled={!!busy} onClick={() => act("notes", { notes })}>{busy === "notes" ? "Saving…" : "Save notes"}</button>
      </div>
      {results && <ul className="hint" style={{ margin: "8px 0 0 18px" }}>{results.map((r) => <li key={r.to}>{r.ok ? "Sent" : "Not sent"}: {r.to}{r.error ? ` (${r.error})` : ""}</li>)}</ul>}
      {err && <p className="err">{err}</p>}
      {msg && <p className="ok-msg">{msg}</p>}
    </div>
  );
}
