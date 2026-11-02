"use client";
import { useState, useRef, useEffect } from "react";

// Only allow redirects back into this site.
function safeNext() {
  if (typeof window === "undefined") return "/";
  const n = new URLSearchParams(window.location.search).get("next") || "/";
  return n.startsWith("/") && !n.startsWith("//") ? n : "/";
}

export default function Login() {
  const [step, setStep] = useState("email"); // "email" → "code"
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const codeRef = useRef(null);
  useEffect(() => { if (step === "code") codeRef.current?.focus(); }, [step]);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("error") === "link")
      setErr("That sign-in link expired or was opened in a different browser. Send a new one.");
  }, []);

  async function post(url, body, ms) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal });
      return await r.json().catch(() => ({ ok: false, error: `Server error (${r.status})` }));
    } catch (e) {
      return { ok: false, error: e.name === "AbortError" ? "The server took too long to respond." : String(e.message || e) };
    } finally { clearTimeout(t); }
  }

  async function sendCode(e) {
    e?.preventDefault();
    const addr = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(addr)) { setErr("Enter a valid email address."); return; }
    setBusy(true); setErr(""); setNote("");
    const d = await post("/api/auth/send-code", { email: addr, next: safeNext() }, 35000);
    setBusy(false);
    if (!d.ok) {
      const msg = String(d.error || "");
      if (d.code === "not_invited" || /signup|not allowed|otp_disabled/i.test(msg)) setErr("This email isn't set up for the portal yet. Ask House & Home to add you.");
      else if (/rate|too many|seconds/i.test(msg)) setErr("Too many attempts. Wait a few minutes and try again. (" + msg + ")");
      else setErr("Couldn't send the code: " + msg);
      return;
    }
    setEmail(addr); setStep("code"); setNote(`We emailed a sign-in code to ${addr}. If the email has a link instead, just tap it on this device.`);
  }

  async function verify(e) {
    e?.preventDefault();
    const token = code.replace(/\D/g, "");
    if (token.length < 6) { setErr("Enter the 6-digit code from the email."); return; }
    setBusy(true); setErr("");
    const d = await post("/api/auth/verify-code", { email, token }, 25000);
    if (!d.ok) { setBusy(false); setErr("That code didn't work: " + (d.error || "check it, or send a new one.")); return; }
    window.location.replace(safeNext());
  }

  return (
    <>
      <header><div className="bar">
        <a className="brand" href="/"><b>House&nbsp;<span>&amp;</span>&nbsp;Home</b><span className="sub">Inspector Portal</span></a>
      </div></header>
      <div className="shell" style={{ maxWidth: 460 }}>
        <section className="card">
          <h2>Sign in</h2>
          {step === "email" ? (
            <form onSubmit={sendCode}>
              <p className="intro">Enter your email and we'll send you a sign-in code. No password needed.</p>
              <div className={"field" + (err ? " invalid" : "")}>
                <label htmlFor="email">Email</label>
                <input id="email" type="email" autoComplete="email" inputMode="email" autoFocus
                  value={email} onChange={(e) => setEmail(e.target.value)} />
                {err && <div className="err">{err}</div>}
              </div>
              <button className="btn" type="submit" disabled={busy}>{busy ? "Sending…" : "Send code"}</button>
            </form>
          ) : (
            <form onSubmit={verify}>
              <p className="intro">{note} It can take a minute; check spam if you don't see it.</p>
              <div className={"field" + (err ? " invalid" : "")}>
                <label htmlFor="code">6-digit code</label>
                <input id="code" ref={codeRef} inputMode="numeric" autoComplete="one-time-code" maxLength={10}
                  value={code} onChange={(e) => setCode(e.target.value)} style={{ letterSpacing: "0.3em", fontSize: 22 }} />
                {err && <div className="err">{err}</div>}
              </div>
              <button className="btn" type="submit" disabled={busy}>{busy ? "Checking…" : "Sign in"}</button>
              <p className="hint" style={{ marginTop: 14 }}>
                <a href="#" onClick={(e) => { e.preventDefault(); setCode(""); sendCode(); }}>Send a new code</a>
                {" · "}
                <a href="#" onClick={(e) => { e.preventDefault(); setStep("email"); setCode(""); setErr(""); }}>Use a different email</a>
              </p>
            </form>
          )}
        </section>
      </div>
    </>
  );
}
