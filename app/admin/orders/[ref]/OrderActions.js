"use client";
import { useState } from "react";

export default function OrderActions({ order, people }) {
  const [when, setWhen] = useState(order.scheduledLocal);
  const [who, setWho] = useState(order.inspectorId);
  const [notes, setNotes] = useState(order.notes);
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  async function save(extra = {}, label = "save") {
    setBusy(label); setErr(""); setMsg("");
    const body = { ref: order.ref, scheduledAt: when ? `${when}:00-07:00` : null, inspectorId: who || null, notes, notifyInspector: notify && who && who !== order.inspectorId, ...extra };
    const d = await fetch("/api/admin/orders", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then((r) => r.json()).catch((e) => ({ ok: false, error: String(e) }));
    setBusy("");
    if (!d.ok) { setErr(d.error || "Couldn't save"); return; }
    setMsg(d.notified ? "Saved, and the inspector was emailed." : "Saved.");
    setTimeout(() => window.location.reload(), 900);
  }

  return (
    <div>
      <h3 style={{ marginTop: 0 }}>Schedule</h3>
      <div className="field"><label htmlFor="when">Date &amp; time (Arizona)</label>
        <input id="when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></div>
      <div className="field"><label htmlFor="who">Inspector</label>
        <select id="who" value={who} onChange={(e) => setWho(e.target.value)}>
          <option value="">Not assigned</option>
          {people.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select></div>
      {who && who !== order.inspectorId && (
        <label className="agree" style={{ marginBottom: 10 }}><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /><span>Email the inspector about this assignment</span></label>
      )}
      <div className="field"><label htmlFor="notes">Office notes</label>
        <textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Payment status in ISN, gate instructions, etc." /></div>
      <div className="stack">
        <button className="btn" type="button" disabled={!!busy} onClick={() => save()}>{busy === "save" ? "Saving…" : "Save"}</button>
        {order.job
          ? <a className="btn ghost" href={`/admin/review/${encodeURIComponent(order.job.ref)}`}>Open job {order.job.ref}</a>
          : <a className="btn ghost" href={`/?order=${encodeURIComponent(order.id)}`}>Start the job now</a>}
        <hr />
        {order.status !== "canceled"
          ? <button className="btn ghost" type="button" disabled={!!busy} onClick={() => { if (window.confirm("Cancel this order?")) save({ status: "canceled" }, "cancel"); }}>Cancel order</button>
          : <button className="btn ghost" type="button" disabled={!!busy} onClick={() => save({ status: "new" }, "restore")}>Restore order</button>}
      </div>
      {err && <p className="err">{err}</p>}
      {msg && <p className="ok-msg">{msg}</p>}
    </div>
  );
}
