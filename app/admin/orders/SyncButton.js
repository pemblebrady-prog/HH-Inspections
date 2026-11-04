"use client";
import { useState } from "react";
export default function SyncButton() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function go() {
    setBusy(true); setMsg("");
    const d = await fetch("/api/admin/orders", { method: "POST" }).then((r) => r.json()).catch((e) => ({ ok: false, error: String(e) }));
    setBusy(false);
    if (!d.ok) { setMsg(d.error || "Couldn't check"); return; }
    setMsg(d.created ? `${d.created} new request${d.created === 1 ? "" : "s"} added.` : "No new requests.");
    if (d.created) setTimeout(() => window.location.reload(), 900);
  }
  return <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>{msg && <span className="hint">{msg}</span>}<button className="btn ghost" type="button" disabled={busy} onClick={go} style={{ margin: 0 }}>{busy ? "Checking…" : "Check for new requests"}</button></span>;
}
