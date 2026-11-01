"use client";
import { useState, useRef, useEffect } from "react";
import { createClient } from "../../lib/supabase/browser";

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

  async function sendCode(e) {
    e?.preventDefault();
    const addr = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(addr)) { setErr("Enter a valid email address."); return; }
    setBusy(true); setErr(""); setNote("");
    const { error } = await createClient().auth.signInWithOtp({
      email: addr,
      options: {
        shouldCreateUser: false, // invite-only: unknown emails can't sign up
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext())}`,
      },
    });
    setBusy(false);
    if (error) {
      const msg = String(error.message || "");
      if (/signup|not allowed|not found/i.test(msg)) setErr("This email isn't set up for the portal yet. Ask House & Home to add you.");
      else if (/rate|too many|seconds/i.test(msg)) setErr("Too many attempts. Wait a minute and try again.");
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
    const { error } = await createClient().auth.verifyOtp({ email, token, type: "email" });
    if (error) { setBusy(false); setErr("That code didn't work. Check it, or send a new one."); return; }
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
