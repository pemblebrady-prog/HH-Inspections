"use client";
import { useEffect, useRef, useState } from "react";

// Loads Stripe.js from Stripe (required by Stripe; never bundled).
function loadStripeJs() {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.Stripe) return Promise.resolve(window.Stripe);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://js.stripe.com/v3/";
    s.onload = () => resolve(window.Stripe);
    s.onerror = () => reject(new Error("Couldn't load Stripe"));
    document.head.appendChild(s);
  });
}

async function api(url, body) {
  return fetch(url, { method: body ? "POST" : "GET", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined })
    .then((r) => r.json()).catch((e) => ({ ok: false, error: String(e) }));
}

// Save a business bank account (ACH, preferred) or a card for automatic per-job charges.
export default function PaymentSetup({ companyId, onSaved }) {
  const [billing, setBilling] = useState(null);
  const [stripeReady, setStripeReady] = useState(true);
  const [open, setOpen] = useState(false);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const mountRef = useRef(null);
  const sRef = useRef({ stripe: null, elements: null, mounted: false });
  const q = companyId ? `?companyId=${encodeURIComponent(companyId)}` : "";

  async function refresh() {
    const d = await api("/api/billing" + q);
    if (d.ok) { setBilling(d.billing); setStripeReady(d.stripeReady); } else setErr(d.error || "Couldn't load billing");
  }

  useEffect(() => {
    refresh();
    // Coming back from a bank redirect (rare): finish saving.
    const p = new URLSearchParams(window.location.search);
    const si = p.get("setup_intent");
    if (si) {
      api("/api/billing/confirm", { setupIntentId: si }).then((d) => {
        if (d.ok) { setBilling(d.billing); setMsg(d.saved ? `Saved ${d.method}.` : "Your bank is verifying the account."); if (d.saved && onSaved) onSaved(d.billing); }
        else setErr(d.error);
        window.history.replaceState(null, "", window.location.pathname);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function start() {
    setErr(""); setMsg(""); setBusy(true);
    const d = await api("/api/billing/setup", { companyId });
    if (!d.ok) { setBusy(false); setErr(d.error || "Couldn't start"); return; }
    try {
      const Stripe = await loadStripeJs();
      const stripe = Stripe(d.publishableKey);
      const elements = stripe.elements({
        clientSecret: d.clientSecret,
        appearance: { theme: "stripe", variables: { colorPrimary: "#A2382A", fontFamily: "Inter, system-ui, sans-serif", borderRadius: "4px" } },
      });
      sRef.current = { stripe, elements, mounted: false };
      setOpen(true); // the effect below mounts the form once the box is on screen
    } catch (e) { setBusy(false); setErr(e.message); }
  }

  // Mount Stripe's form after the box renders; surface load errors instead of a blank box.
  useEffect(() => {
    const st = sRef.current;
    if (!open || !st.elements || st.mounted || !mountRef.current) return;
    st.mounted = true;
    const el = st.elements.create("payment", { layout: "tabs" });
    el.on("ready", () => setBusy(false));
    el.on("loaderror", (ev) => {
      setBusy(false);
      const m = (ev && ev.error && ev.error.message) || "Stripe's form couldn't load.";
      setErr(/No such setupintent|client_secret/i.test(m)
        ? "Stripe's form couldn't load: the publishable key and secret key in Vercel look like they're from different Stripe accounts or sandboxes. (" + m + ")"
        : "Stripe's form couldn't load: " + m);
    });
    el.mount(mountRef.current);
    const t = setTimeout(() => { setBusy((b) => { if (b) setErr("Stripe's form is taking too long to load. Check your connection, or try another browser."); return false; }); }, 20000);
    return () => clearTimeout(t);
  }, [open]);

  async function save(e) {
    e.preventDefault();
    if (!agree) { setErr("Please check the authorization box."); return; }
    const { stripe, elements } = sRef.current;
    if (!stripe) return;
    setBusy(true); setErr("");
    const { error, setupIntent } = await stripe.confirmSetup({ elements, redirect: "if_required", confirmParams: { return_url: window.location.href } });
    if (error) { setBusy(false); setErr(error.message || "Couldn't save"); return; }
    const d = await api("/api/billing/confirm", { setupIntentId: setupIntent.id });
    setBusy(false);
    if (!d.ok) { setErr(d.error || "Couldn't save"); return; }
    setBilling(d.billing); setOpen(false); setAgree(false);
    if (d.saved) { setMsg(`Saved ${d.method}. Future jobs will be charged automatically.`); if (onSaved) onSaved(d.billing); }
    else if (d.verifyUrl) setMsg("Stripe sent two small deposits to verify this account. When they arrive (1–2 business days), confirm them using the link in Stripe's email.");
    else setMsg(d.error || "Your bank is still setting up the account.");
  }

  if (!billing) return <p className="hint">{err || "Loading payment details…"}</p>;
  if (billing.internal) return <p className="intro">House &amp; Home jobs aren't charged.</p>;
  const price = `$${((billing.price_cents || 13500) / 100).toFixed(2)}`;

  return (
    <div>
      <div className="pay-current">
        <div>
          <div className="mono">Payment method on file</div>
          <b>{billing.method || "None yet"}</b>
          {billing.method && <span className="hint"> · {billing.ready ? (billing.type === "ach" ? "Bank account (ACH)" : "Card") : "Not ready"}</span>}
          {billing.note && <p className="hint" style={{ margin: "4px 0 0" }}>{billing.note}</p>}
        </div>
        {!open && stripeReady && <button type="button" className="btn ghost" onClick={start} disabled={busy}>{busy ? "Loading…" : billing.method ? "Change" : "Add payment method"}</button>}
      </div>
      {!stripeReady && <p className="hint">Online payment isn't switched on yet. House &amp; Home will contact you to set it up.</p>}

      {open && (
        <form onSubmit={save} style={{ marginTop: 16 }}>
          <p className="hint">Choose <b>US bank account</b> to connect your business checking account (lower fees, preferred), or <b>Card</b>.</p>
          {busy && <p className="hint" style={{ margin: "10px 0 0" }}>Loading secure form…</p>}
          <div ref={mountRef} className="stripe-mount" />
          <label className="agree">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span>I authorize House &amp; Home Inspection Service to charge this payment method {price} for each certification submitted by {billing.name}, until I change or remove it.</span>
          </label>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn" type="submit" disabled={busy}>{busy ? "Saving…" : "Save payment method"}</button>
            <button className="btn ghost" type="button" disabled={busy} onClick={() => { setOpen(false); sRef.current = { stripe: null, elements: null, mounted: false }; }}>Cancel</button>
          </div>
        </form>
      )}
      {err && <p className="err">{err}</p>}
      {msg && <p className="ok-msg">{msg}</p>}
    </div>
  );
}
