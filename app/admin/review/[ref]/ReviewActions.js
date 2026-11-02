"use client";
import { useState } from "react";

const NEXT = {
  submitted:    [["start", "Start review", ""]],
  under_review: [["certify", "Mark certified", ""], ["reopen", "Back to queue", "ghost"]],
  certified:    [["deliver", "Mark delivered", ""], ["reopen", "Reopen", "ghost"]],
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
      {err && <p className="err">{err}</p>}
      {msg && <p className="ok-msg">{msg}</p>}
    </div>
  );
}
