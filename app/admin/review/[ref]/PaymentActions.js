"use client";
import { useState } from "react";
import { payLabel } from "../../../../lib/payLabel";

const money = (c) => `$${((c || 0) / 100).toFixed(2)}`;
const day = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

// Office-only payment section on the job page (engineers never see this): charge, waive, refund.
export default function PaymentActions({ job, refunds = [] }) {
  const needsAction = ["unpaid", "failed"].includes(job.payment_status);
  const left = Math.max(0, (job.amount_cents || 0) - (job.refunded_cents || 0));
  const canRefund = ["paid", "refunded"].includes(job.payment_status) && left > 0 && !job.internal;
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [refunding, setRefunding] = useState(false);
  const [kind, setKind] = useState("full");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  async function call(url, method, body) {
    const d = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then((r) => r.json()).catch((e) => ({ ok: false, error: String(e) }));
    if (!d.ok) { setErr(d.error || "Something went wrong"); return false; }
    window.location.reload(); return true;
  }
  async function act(action) {
    setBusy(action); setErr("");
    await call("/api/admin/submissions", "PATCH", { ref: job.ref, action });
    setBusy("");
  }
  async function refund(e) {
    e.preventDefault(); setErr("");
    const cents = kind === "full" ? left : Math.round(Number(String(amount).replace(/[$,\s]/g, "")) * 100);
    if (!(cents > 0)) { setErr("Enter the amount to refund."); return; }
    if (cents > left) { setErr(`You can refund at most ${money(left)}.`); return; }
    if (!window.confirm(`Refund ${money(cents)} for job ${job.ref}? This sends the money back to the card or bank account it came from and can't be undone.`)) return;
    setBusy("refund");
    await call("/api/admin/refunds", "POST", { ref: job.ref, amount: kind === "full" ? "" : (cents / 100).toFixed(2), reason });
    setBusy("");
  }

  return (
    <details open={needsAction || refunds.length > 0}>
      <summary style={{ cursor: "pointer", fontWeight: 700 }}>
        Payment (office only) · <span style={{ fontWeight: 400, color: job.payment_status === "failed" ? "var(--err)" : "var(--muted)" }}>{payLabel(job)}</span>
      </summary>
      <p className="hint">{job.internal ? "House & Home job: no portal charge." : `Amount: ${money(job.amount_cents)}`}{job.refunded_cents > 0 ? ` · refunded ${money(job.refunded_cents)}` : ""}. The engineer doesn't see this section.</p>
      {needsAction && (
        <div className="stack" style={{ marginTop: 10 }}>
          <button className="btn ghost" type="button" disabled={!!busy} onClick={() => act("charge")}>{busy === "charge" ? "Charging…" : "Charge payment method now"}</button>
          <button className="btn ghost" type="button" disabled={!!busy} onClick={() => { if (window.confirm("Waive the fee for this job?")) act("waive"); }}>{busy === "waive" ? "Saving…" : "Waive fee"}</button>
        </div>
      )}

      {refunds.length > 0 && (
        <ul className="refund-list">
          {refunds.map((r, i) => (
            <li key={i}><b>{money(r.amount)}</b> refunded {day(r.at)}{r.by ? ` by ${r.by}` : r.source === "stripe" ? " in Stripe" : ""}
              {r.status !== "succeeded" ? <span className="hint"> ({r.status})</span> : null}{r.reason ? <div className="hint">{r.reason}</div> : null}</li>
          ))}
        </ul>
      )}

      {canRefund && !refunding && <button className="btn ghost" type="button" style={{ marginTop: 10 }} onClick={() => setRefunding(true)}>Refund…</button>}
      {canRefund && refunding && (
        <form onSubmit={refund} className="send-box" style={{ marginTop: 10 }}>
          <div className="chips" style={{ marginBottom: 10 }}>
            <button type="button" className={"chip" + (kind === "full" ? " on" : "")} onClick={() => setKind("full")}>Full: {money(left)}</button>
            <button type="button" className={"chip" + (kind === "part" ? " on" : "")} onClick={() => setKind("part")}>Part of it</button>
          </div>
          {kind === "part" && (
            <div className="field" style={{ marginBottom: 10 }}><label htmlFor="rf-amt" className="req">Amount ($)</label>
              <input id="rf-amt" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={`up to ${(left / 100).toFixed(2)}`} autoFocus /></div>
          )}
          <div className="field" style={{ marginBottom: 10 }}><label htmlFor="rf-why">Reason (shown on the refund receipt)</label>
            <input id="rf-why" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Duplicate submission" /></div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn" disabled={!!busy}>{busy === "refund" ? "Refunding…" : "Refund"}</button>
            <button className="btn ghost" type="button" disabled={!!busy} onClick={() => { setRefunding(false); setErr(""); }}>Cancel</button>
          </div>
          <p className="hint" style={{ marginTop: 8 }}>The company gets a refund receipt by email. Refunds made directly in Stripe show up here too.</p>
        </form>
      )}
      {err && <p className="err">{err}</p>}
    </details>
  );
}
