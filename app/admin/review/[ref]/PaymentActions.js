"use client";
import { useState } from "react";

const PAY = { paid: "Paid", processing: "Processing (bank payment clearing)", failed: "Failed", unpaid: "Not charged", waived: "No charge", refunded: "Refunded" };

// Office-only payment section on the job page (engineers never see this).
export default function PaymentActions({ job }) {
  const needsAction = ["unpaid", "failed"].includes(job.payment_status);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  async function act(action) {
    setBusy(action); setErr("");
    const d = await fetch("/api/admin/submissions", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ref: job.ref, action }),
    }).then((r) => r.json()).catch((e) => ({ ok: false, error: String(e) }));
    setBusy("");
    if (!d.ok) { setErr(d.error || "Something went wrong"); return; }
    window.location.reload();
  }
  return (
    <details open={needsAction}>
      <summary style={{ cursor: "pointer", fontWeight: 700 }}>
        Payment (office only) · <span style={{ fontWeight: 400, color: job.payment_status === "failed" ? "var(--err)" : "var(--muted)" }}>{PAY[job.payment_status] || job.payment_status}</span>
      </summary>
      <p className="hint">{job.internal ? "House & Home job: no portal charge." : `Amount: $${((job.amount_cents || 0) / 100).toFixed(2)}`}. The engineer doesn't see this section.</p>
      {needsAction && (
        <div className="stack" style={{ marginTop: 10 }}>
          <button className="btn ghost" type="button" disabled={!!busy} onClick={() => act("charge")}>{busy === "charge" ? "Charging…" : "Charge payment method now"}</button>
          <button className="btn ghost" type="button" disabled={!!busy} onClick={() => { if (window.confirm("Waive the fee for this job?")) act("waive"); }}>{busy === "waive" ? "Saving…" : "Waive fee"}</button>
        </div>
      )}
      {err && <p className="err">{err}</p>}
    </details>
  );
}
