"use client";
import { useState } from "react";

// Charge now / Send reminder for one line of Accounts receivable.
export default function ArActions({ item }) {
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const post = (url, body, method = "POST") => fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    .then((r) => r.json()).catch((e) => ({ ok: false, error: e.message }));

  async function charge() {
    if (!window.confirm(`Charge ${item.ref}${item.kind === "fee" ? "'s re-inspection fee" : ""} now to the company's payment method on file?`)) return;
    setBusy("charge"); setErr(""); setMsg("");
    const d = item.kind === "fee"
      ? await post("/api/admin/corrections", { ref: item.ref, action: "fee_charge" })
      : await post("/api/admin/submissions", { ref: item.ref, action: "charge" }, "PATCH");
    setBusy("");
    if (!d.ok) { setErr(d.error || "Couldn't charge it."); return; }
    setMsg(d.warning || d.message || "Charged. Refresh to update the list.");
  }
  async function remind() {
    setBusy("remind"); setErr(""); setMsg("");
    const d = await post("/api/admin/receivables", { ref: item.ref, kind: item.kind, round: item.round });
    setBusy("");
    if (!d.ok) { setErr(d.error || "Couldn't send it."); return; }
    setMsg(`Reminder sent to ${d.sent.join(", ")}.`);
  }
  if (item.state === "processing") return <span className="hint" style={{ margin: 0 }}>Wait for it to clear</span>;
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
      <button type="button" className="viewswitch" disabled={!!busy} onClick={charge}>{busy === "charge" ? "Charging…" : "Charge now"}</button>
      <button type="button" className="viewswitch" disabled={!!busy} onClick={remind}>{busy === "remind" ? "Sending…" : "Send reminder"}</button>
      {msg && <span className="ok-msg" style={{ margin: 0, fontSize: 12 }}>{msg}</span>}
      {err && <span className="err" style={{ margin: 0, fontSize: 12 }}>{err}</span>}
    </div>
  );
}
