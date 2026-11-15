"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const EVERY = 15 * 60 * 1000; // check for new jobs every 15 minutes

// Refresh button + automatic refresh for the review queue, and the waiting
// count in the browser tab title ("(3) Review queue").
export default function QueueRefresh({ waiting, loadedAt }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const last = useRef(Date.now());

  useEffect(() => {
    document.title = `${waiting ? `(${waiting}) ` : ""}Review queue | House & Home`;
  }, [waiting]);

  useEffect(() => { setBusy(false); }, [loadedAt]); // new data arrived

  function refresh() { last.current = Date.now(); setBusy(true); router.refresh(); }

  useEffect(() => {
    // Only while the page is open and visible; catch up as soon as it's looked at again.
    const tick = () => { if (!document.hidden && Date.now() - last.current >= EVERY) refresh(); };
    const t = setInterval(tick, 60 * 1000);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", tick); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const at = new Date(loadedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Phoenix" });
  return (
    <span className="queue-refresh">
      <span className="hint" style={{ margin: 0 }}>Updated {at}</span>
      <button type="button" className="viewswitch" onClick={refresh} disabled={busy}>{busy ? "Refreshing…" : "↻ Refresh"}</button>
    </span>
  );
}
