"use client";
import { useState } from "react";
import { NOTIFY_KINDS } from "../../lib/roles";

export default function NotifySettings({ initial, preview }) {
  const [on, setOn] = useState(() => Object.fromEntries(NOTIFY_KINDS.map(([k]) => [k, initial[k] !== false])));
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  async function flip(k) {
    const next = { ...on, [k]: !on[k] };
    setOn(next); setMsg(""); setErr("");
    const d = await fetch("/api/me/notify", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) })
      .then((r) => r.json()).catch((e) => ({ ok: false, error: String(e) }));
    if (!d.ok) { setOn(on); setErr(d.error || "Couldn't save"); return; }
    setMsg("Saved.");
  }

  return (
    <div>
      <ul className="notify-list">
        {NOTIFY_KINDS.map(([k, label, hint]) => (
          <li key={k}>
            <label>
              <input type="checkbox" checked={on[k]} onChange={() => flip(k)} disabled={preview} />
              <span><b>{label}</b><small>{hint}</small></span>
            </label>
          </li>
        ))}
        <li>
          <label>
            <input type="checkbox" checked readOnly disabled />
            <span><b>Payment failed</b><small>Always on: a job waits on hold until the payment is fixed, so you'll always hear about it.</small></span>
          </label>
        </li>
      </ul>
      {msg && <p className="ok-msg">{msg}</p>}
      {err && <p className="err">{err}</p>}
    </div>
  );
}
