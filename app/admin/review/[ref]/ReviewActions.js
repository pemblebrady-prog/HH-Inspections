"use client";
import { useState } from "react";

const NEXT = {
  submitted:    [["start", "Start review", ""]],
  under_review: [["certify", "Mark certified", ""], ["reopen", "Back to queue", "ghost"]],
  certified:    [["reopen", "Reopen", "ghost"]],
  delivered:    [["reopen", "Reopen", "ghost"]],
  on_hold:      [["start", "Start review anyway", "ghost"]],
  canceled:     [["reopen", "Restore", "ghost"]],
  corrections:  [], // waiting for the follow-up (see Corrections below)
  cannot_certify: [],
};
// House & Home office managers (Nov 25): they can start a review, send a certified letter and close a
// cannot-certify job; corrections, letters, certifying and reopening are the engineer's.
const OFFICE_MOVES = ["start"];
const CAN_REFUSE = ["submitted", "under_review", "corrections", "on_hold"];

export default function ReviewActions({ job, engineer = true }) {
  const [refusing, setRefusing] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [notes, setNotes] = useState(job.review_notes);
  const [letter, setLetter] = useState(job.letter_link);
  const [to, setTo] = useState((job.recipients || []).join("\n"));
  const [results, setResults] = useState(null);
  const canSend = ["certified", "delivered"].includes(job.status) && letter;
  const needsCertify = job.status === "under_review" && letter;

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
    const stampNote = d.stamped === "placed" ? " Your stamp and signature were added to the PDF."
      : d.stamped === "box not found" ? " Note: the grey stamp box wasn't in the letter, so no stamp was added automatically (fine if you added it by hand)."
      : d.stamped && d.stamped !== "no images" ? " Note: the stamp couldn't be added automatically; check the PDF in the job's Drive folder." : "";
    setMsg((d.clear ? "Clear letter sent." : "Final letter sent.") + " The job is marked delivered." + stampNote);
    setTimeout(() => window.location.reload(), stampNote ? 6000 : 2500);
  }

  async function act(action, extra = {}) {
    setBusy(action); setErr(""); setMsg("");
    const d = await fetch("/api/admin/submissions", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ref: job.ref, action, ...extra }),
    }).then((r) => r.json()).catch((e) => ({ ok: false, error: String(e) }));
    setBusy("");
    if (d.needsConfirm) {
      if (window.confirm(d.error)) return act(action, { ...extra, force: true });
      return;
    }
    if (!d.ok) { setErr(d.error || "Something went wrong"); return; }
    if (action === "cannot_certify") { setMsg(`Marked cannot certify. ${d.emailed && d.emailed.length ? `Emailed ${d.emailed.join(", ")}.` : ""} Reloading…`); setTimeout(() => window.location.reload(), 2500); return; }
    if (action === "letter") { setLetter(d.submission.letter_link); setMsg("New draft letter created."); return; }
    if (action === "notes") { setMsg("Notes saved."); return; }
    window.location.reload();
  }

  return (
    <div>
      <h3 style={{ marginTop: 0 }}>Actions</h3>
      {job.status === "cannot_certify" && (
        <div style={{ background: "#f6dcd6", padding: "10px 12px", borderRadius: 6, marginBottom: 12 }}>
          <b>Cannot certify</b>
          {job.cannot_certify_reason && <p style={{ margin: "6px 0" }}>{job.cannot_certify_reason}</p>}
          <p className="hint" style={{ margin: 0 }}>
            {["paid", "processing"].includes(job.payment_status) ? "The customer needs a refund (Payment, below). Then close the job." : "Nothing to refund. Close the job when you're ready."}
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            <button className="btn" type="button" disabled={!!busy} onClick={() => { if (window.confirm("Close this job? It's marked canceled.")) act("close"); }}>{busy === "close" ? "Closing…" : "Close job"}</button>
            {engineer && <button className="btn ghost" type="button" disabled={!!busy} onClick={() => act("review_again")}>{busy === "review_again" ? "Saving…" : "Review it again"}</button>}
          </div>
        </div>
      )}
      <div className="stack">
        {job.status === "cannot_certify" ? null : job.status === "corrections"
          ? <p className="hint" style={{ margin: 0 }}>Waiting for the corrections follow-up (see Corrections below).</p>
          : <>
            {letter
              ? <a className="btn" href={letter} target="_blank" rel="noreferrer">{job.clear ? "Open clear letter" : "Open draft letter"}</a>
              : <p className="hint">No draft letter yet.</p>}
            {engineer && (
              <button className="btn ghost" type="button" disabled={!!busy} onClick={() => act("letter")}>
                {busy === "letter" ? "Making letter…" : letter ? (job.clear ? "Remake clear letter" : "Regenerate letter") : "Make draft letter"}
              </button>
            )}
          </>}
        {job.drive_link && <a className="btn ghost" href={job.drive_link} target="_blank" rel="noreferrer">Open Drive folder</a>}
        {canSend && (
          <div className="send-box">
            <b>{job.status === "delivered" ? "Send again" : job.clear ? "Send clear letter" : "Send final letter"}</b>
            <p className="hint" style={{ margin: "4px 0 8px" }}>First add the PE stamp and signature in the Google Doc and delete the yellow DRAFT note. The letter is emailed as a PDF and saved to the Drive folder.</p>
            <label htmlFor="to" className="hint">Send to (one per line)</label>
            <textarea id="to" rows={3} value={to} onChange={(e) => setTo(e.target.value)} placeholder="client@example.com" />
            <button className="btn" type="button" disabled={!!busy} onClick={() => send(false)}>{busy === "send" ? "Sending…" : job.status === "delivered" ? "Send again" : job.clear ? "Send clear letter" : "Send final letter"}</button>
            {job.final_pdf_link && <a className="hint" href={job.final_pdf_link} target="_blank" rel="noreferrer">Last sent PDF</a>}
          </div>
        )}
        {needsCertify && <p className="hint" style={{ margin: 0 }}>{engineer ? "Mark the job certified (below) to send the final letter." : "The engineer marks it certified; then you can send the final letter here."}</p>}
        <hr />
        {(NEXT[job.status] || []).filter(([a]) => engineer || OFFICE_MOVES.includes(a)).map(([a, label, style]) => (
          <button key={a} className={"btn" + (style ? " " + style : "")} type="button" disabled={!!busy}
            onClick={() => { if (a !== "certify" || window.confirm("Mark this job certified? Do this once the letter is final. Then you can send it.")) act(a); }}>
            {busy === a ? "Saving…" : label}
          </button>
        ))}
        {engineer && CAN_REFUSE.includes(job.status) && !refusing && (
          <button className="btn ghost" type="button" disabled={!!busy} onClick={() => setRefusing(true)}>Cannot certify…</button>
        )}
        {refusing && (
          <div className="send-box">
            <b>Cannot certify this job</b>
            <p className="hint" style={{ margin: "4px 0 8px" }}>For a home that can't be certified no matter what's fixed. The office is emailed to refund the customer and close the job. (If it can be fixed, use Corrections instead.)</p>
            <label htmlFor="refuse" className="hint">Why? (the office sees this)</label>
            <textarea id="refuse" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Home built before June 15, 1976 (not HUD code)" />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn" type="button" disabled={!!busy || !reason.trim()} onClick={() => act("cannot_certify", { reason })}>{busy === "cannot_certify" ? "Saving…" : "Mark cannot certify"}</button>
              <button className="btn ghost" type="button" disabled={!!busy} onClick={() => setRefusing(false)}>Cancel</button>
            </div>
          </div>
        )}
      </div>
      <div className="field" style={{ marginTop: 16 }}>
        <label htmlFor="notes">Internal notes</label>
        <textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Only House & Home staff see these." />
        <button className="viewswitch" type="button" style={{ marginTop: 6 }} disabled={!!busy} onClick={() => act("notes", { notes })}>{busy === "notes" ? "Saving…" : "Save notes"}</button>
      </div>
      {results && <ul className="hint" style={{ margin: "8px 0 0 18px" }}>{results.map((r) => <li key={r.to}>{r.ok ? "Sent" : "Not sent"}: {r.to}{r.error ? ` (${r.error})` : ""}</li>)}</ul>}
      {err && <p className="err">{err}</p>}
      {msg && <p className="ok-msg">{msg}</p>}
    </div>
  );
}
