"use client";
import { useEffect, useState } from "react";
import PaymentSetup from "../PaymentSetup";

const LABEL = { paid: "Paid", processing: "Processing", failed: "Failed", refunded: "Refunded", waived: "Waived", unpaid: "Unpaid" };

export default function BillingClient() {
  const [payments, setPayments] = useState(null);
  function load() { fetch("/api/billing").then((r) => r.json()).then((d) => setPayments(d.ok ? d.payments : [])).catch(() => setPayments([])); }
  useEffect(load, []);
  return (
    <>
      <section className="card">
        <h2>Payment method</h2>
        <p className="intro">Each certification is charged automatically when your inspector submits it. Bank transfers (ACH) take a few business days to clear; the job goes to the engineer right away.</p>
        <PaymentSetup onSaved={load} />
      </section>
      <section className="card" style={{ marginTop: 18 }}>
        <h2>Recent charges</h2>
        {!payments && <p className="hint">Loading…</p>}
        {payments && payments.length === 0 && <p className="hint">No charges yet.</p>}
        {payments && payments.length > 0 && (
          <div className="table-wrap"><table className="track">
            <thead><tr><th>Date</th><th>Job</th><th>Amount</th><th>Method</th><th>Status</th></tr></thead>
            <tbody>{payments.map((p) => (
              <tr key={p.id}>
                <td>{new Date(p.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
                <td>{p.submission ? `${p.submission.ref}${p.submission.property_address ? " · " + p.submission.property_address : ""}` : "—"}</td>
                <td>${(p.amount_cents / 100).toFixed(2)}</td>
                <td>{p.method === "ach" ? "Bank" : "Card"}</td>
                <td>{LABEL[p.status] || p.status}{p.failure_reason ? <div className="hint">{p.failure_reason}</div> : null}</td>
              </tr>))}
            </tbody>
          </table></div>
        )}
      </section>
    </>
  );
}
