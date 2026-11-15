"use client";
import { useEffect, useRef, useState } from "react";
import { loadStripeJs } from "../../PaymentSetup";

const money = (c) => `$${(Number(c || 0) / 100).toFixed(2)}`;
const api = (url, method, body) => fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined })
  .then((r) => r.json()).catch((e) => ({ ok: false, error: String(e) }));

export default function PayClient({ job }) {
  const [paid, setPaid] = useState(job.paid);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const mountRef = useRef(null);
  const s = useRef({});
  const url = `/api/pay/${encodeURIComponent(job.ref)}`;

  useEffect(() => {
    if (paid) return;
    let gone = false;
    (async () => {
      const d = await api(url, "POST");
      if (gone) return;
      if (d.paid) { setPaid(true); return; }
      if (!d.ok) { setErr(d.error || "Couldn't start the payment."); return; }
      try {
        const Stripe = await loadStripeJs();
        const stripe = Stripe(d.publishableKey);
        const elements = stripe.elements({ clientSecret: d.clientSecret, appearance: { theme: "stripe", variables: { colorPrimary: "#A2382A", borderRadius: "4px" } } });
        const el = elements.create("payment", { layout: "tabs" });
        el.on("ready", () => setReady(true));
        el.on("loaderror", (ev) => setErr("The card form couldn't load: " + ((ev && ev.error && ev.error.message) || "unknown error")));
        el.mount(mountRef.current);
        s.current = { stripe, elements };
      } catch (e) { setErr(e.message); }
    })();
    return () => { gone = true; };
  }, [paid]); // eslint-disable-line react-hooks/exhaustive-deps

  async function pay(e) {
    e.preventDefault();
    const { stripe, elements } = s.current;
    if (!stripe) return;
    setBusy(true); setErr("");
    const { error, paymentIntent } = await stripe.confirmPayment({ elements, redirect: "if_required", confirmParams: { return_url: window.location.href } });
    if (error) { setBusy(false); setErr(error.message || "The payment didn't go through."); return; }
    const d = await api(url, "PATCH", { paymentIntentId: paymentIntent.id });
    setBusy(false);
    if (!d.ok) { setErr(d.error || "Couldn't confirm the payment."); return; }
    setPaid(true);
  }

  // Coming back from a card check (3-D Secure) redirect.
  useEffect(() => {
    const pi = new URLSearchParams(window.location.search).get("payment_intent");
    if (pi && !paid) api(url, "PATCH", { paymentIntentId: pi }).then((d) => { if (d.ok) setPaid(true); window.history.replaceState(null, "", window.location.pathname); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="card">
      <h2>{paid ? "Paid. Thank you!" : `Pay ${money(job.amount)}`}</h2>
      <div className="receipt" style={{ margin: "14px 0" }}>
        <div><span>Job</span><span>{job.ref}</span></div>
        {job.address && <div><span>Property</span><span>{job.address}</span></div>}
        {job.client && <div><span>Client</span><span>{job.client}</span></div>}
        <div><span>Certification fee</span><span>{money(job.amount)}</span></div>
      </div>
      {paid ? (
        <>
          <p className="intro">The job is in the engineer's queue. You'll get the certified letter by email, and a receipt is on its way.</p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}><a className="btn" href="/">Start another job</a><a className="btn ghost" href="/jobs">My jobs</a></div>
        </>
      ) : (
        <form onSubmit={pay}>
          <p className="intro">Your job is saved. It goes to the engineer as soon as it's paid.</p>
          <div ref={mountRef} style={{ minHeight: ready ? 0 : 120 }}>{!ready && !err && <p className="hint">Loading the card form…</p>}</div>
          <button className="btn" style={{ marginTop: 16, width: "100%", justifyContent: "center" }} disabled={!ready || busy}>{busy ? "Paying…" : `Pay ${money(job.amount)}`}</button>
          <p className="hint">Card payments are processed securely by Stripe. Cards only for pay-as-you-go.</p>
        </form>
      )}
      {err && <p className="err">{err}</p>}
    </section>
  );
}
