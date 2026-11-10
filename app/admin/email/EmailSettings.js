"use client";
import { useEffect, useState } from "react";

const api = (method, body) => fetch("/api/admin/email", { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined })
  .then((r) => r.json()).catch((e) => ({ ok: false, error: String(e) }));

export default function EmailSettings({ me, connected, error }) {
  const [s, setS] = useState(null);
  const [to, setTo] = useState(me);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState(connected ? `Connected. Portal emails now send from ${connected}.` : "");
  const [err, setErr] = useState(error);
  const load = () => api("GET").then((d) => (d.ok ? setS(d) : setErr(d.error || "Couldn't load")));
  useEffect(() => { load(); if (connected || error) window.history.replaceState(null, "", "/admin/email"); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function test() {
    setBusy("test"); setErr(""); setMsg("");
    const d = await api("POST", { action: "test", to });
    setBusy("");
    if (d.ok) setMsg(`Test sent to ${d.to} through ${d.via === "gmail" ? "Gmail" : "Resend"}. Check that inbox (and spam).`); else setErr(d.error);
  }
  async function disconnect() {
    if (!window.confirm("Disconnect Gmail? Portal emails will fall back to Resend (which only reaches the Resend account owner until a domain is verified).")) return;
    setBusy("off"); await api("POST", { action: "disconnect" }); setBusy(""); setMsg("Gmail disconnected."); load();
  }

  return (
    <>
      <section className="card">
        <h2>Sending email</h2>
        <p className="intro">Sign-in codes, invites, new-job alerts, receipts, statements and final letters all go out from one address.</p>
        {!s ? <p className="hint">Loading…</p> : s.gmail ? (
          <>
            <p style={{ margin: "14px 0 4px", fontSize: "1.1rem" }}>✓ Sending from <b>{s.gmail.email}</b> (Gmail)</p>
            <p className="hint" style={{ marginTop: 0 }}>Connected {new Date(s.gmail.connectedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}. Sent emails also appear in that account's Sent folder, and replies go to its inbox.</p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
              <a className="btn ghost" href="/api/google/gmail/start">Switch Gmail account</a>
              <button type="button" className="btn ghost" onClick={disconnect} disabled={!!busy}>Disconnect</button>
            </div>
          </>
        ) : (
          <>
            <p style={{ margin: "14px 0 4px" }}><b>Gmail isn't connected.</b> {s.fallback ? `Emails go through Resend from ${s.fallback}, which only reaches the Resend account owner until a domain is verified.` : "No email service is set up, so nothing is sent."}</p>
            <a className="btn" style={{ marginTop: 12 }} href="/api/google/gmail/start">Connect Gmail</a>
            <p className="hint">Sign in with the Gmail account the portal should send from (for example the House & Home engineering Gmail) and allow "Send email on your behalf". The portal can only send. It can't read the inbox.</p>
          </>
        )}
        {msg && <p className="ok-msg" style={{ marginTop: 12 }}>{msg}</p>}
        {err && <p className="err" style={{ marginTop: 12 }}>{err}</p>}
      </section>

      <section className="card" style={{ marginTop: 18 }}>
        <h2>Send a test</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="you@example.com" style={{ flex: 1, minWidth: 220, padding: "9px 10px", border: "1px solid var(--line)", borderRadius: 6 }} />
          <button type="button" className="btn" onClick={test} disabled={!!busy}>{busy === "test" ? "Sending…" : "Send test email"}</button>
        </div>
      </section>
    </>
  );
}
