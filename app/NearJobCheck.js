"use client";
import { useEffect, useState } from "react";

// When an inspector opens an assigned job, compare the phone's location to the job
// address. More than a mile away → a warning (never a block): maybe they tapped the wrong job.
export default function NearJobCheck({ orderId, address, onPickAnother }) {
  const [far, setFar] = useState(null);

  useEffect(() => {
    if (!orderId || typeof navigator === "undefined" || !navigator.geolocation) return;
    const key = `nearok:${orderId}`;
    try { if (sessionStorage.getItem(key)) return; } catch { /* private mode */ }
    let cancelled = false;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const d = await fetch("/api/orders/distance", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: orderId, lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
        }).then((r) => r.json()).catch(() => null);
        if (!cancelled && d && d.ok && d.far) setFar(d.miles);
      },
      () => { /* location off or denied: skip the check */ },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 },
    );
    return () => { cancelled = true; };
  }, [orderId]);

  if (far == null) return null;
  const keepGoing = () => { try { sessionStorage.setItem(`nearok:${orderId}`, "1"); } catch {} setFar(null); };
  return (
    <div className="near-wrap" role="dialog" aria-modal="true" aria-labelledby="near-title">
      <div className="near-box">
        <h3 id="near-title">You don't seem to be at the job site</h3>
        <p>It looks like you're about <b>{far < 10 ? far.toFixed(1) : Math.round(far)} miles</b> from <b>{address}</b>.</p>
        <p>Are you sure you picked the right job? Check the address before you start.</p>
        <div className="near-actions">
          <button type="button" className="btn" onClick={onPickAnother}>Pick a different job</button>
          <button type="button" className="btn ghost" onClick={keepGoing}>Continue anyway</button>
        </div>
      </div>
    </div>
  );
}
