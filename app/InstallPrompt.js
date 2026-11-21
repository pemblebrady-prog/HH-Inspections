"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const KEY = "hh-install-dismissed";
const REMIND_DAYS = 14;

function dismissedRecently() {
  try { const t = Number(localStorage.getItem(KEY) || 0); return t && Date.now() - t < REMIND_DAYS * 864e5; } catch { return false; }
}
function rememberDismiss() { try { localStorage.setItem(KEY, String(Date.now())); } catch { /* private mode */ } }
// The slim reminder bar (shown in the browser after the pop-up was dismissed) hides for a day when closed.
const BAR_KEY = "hh-install-bar-hidden";
function barHiddenToday() {
  try { const t = Number(localStorage.getItem(BAR_KEY) || 0); return t && Date.now() - t < 864e5; } catch { return false; }
}
function hideBarToday() { try { localStorage.setItem(BAR_KEY, String(Date.now())); } catch { /* private mode */ } }

// On phones, offer to put the portal on the home screen (once, then every couple of weeks).
export default function InstallPrompt() {
  const path = usePathname() || "/";
  const [kind, setKind] = useState(null);     // "ios" | "ios-other-browser" | "android"
  const [deferred, setDeferred] = useState(null);
  const [show, setShow] = useState(false);
  const [bar, setBar] = useState(false);

  useEffect(() => {
    const onBip = (e) => { e.preventDefault(); setDeferred(e); };
    window.addEventListener("beforeinstallprompt", onBip);
    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);

  useEffect(() => {
    if (path === "/login" || path.startsWith("/welcome") || path.startsWith("/auth") || path.startsWith("/request") || path.startsWith("/statement") || path === "/privacy" || path === "/terms") return;
    const ua = navigator.userAgent || "";
    const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
    if (standalone) return;
    let k = null;
    if (/iPhone|iPod/i.test(ua) || (/iPad/i.test(ua))) k = /CriOS|FxiOS|EdgiOS|FBAN|FBAV|Instagram|Line\//i.test(ua) ? "ios-other-browser" : "ios";
    else if (/Android/i.test(ua)) k = "android";
    if (!k) return;
    setKind(k);
    // Already said "Not now" to the pop-up: keep a gentle bar at the top instead (Brian, Nov 19).
    if (dismissedRecently()) { if (!barHiddenToday()) setBar(true); return; }
    const t = setTimeout(() => setShow(true), 1800);
    return () => clearTimeout(t);
  }, [path]);

  if (!kind) return null;
  if (!show) {
    if (!bar) return null;
    return (
      <div className="install-bar" role="note">
        <span>Using the browser? Add the portal to your home screen so it opens like an app and keeps you signed in.</span>
        <button type="button" className="install-bar-how" onClick={() => { setBar(false); setShow(true); }}>Show me how</button>
        <button type="button" className="install-bar-x" aria-label="Hide for today" onClick={() => { hideBarToday(); setBar(false); }}>×</button>
      </div>
    );
  }
  const close = () => { rememberDismiss(); setShow(false); if (!barHiddenToday()) setBar(true); };

  async function install() {
    if (!deferred) return;
    deferred.prompt();
    try { await deferred.userChoice; } catch {}
    setDeferred(null); close();
  }

  return (
    <div className="install-sheet" role="dialog" aria-label="Add to Home Screen">
      <button className="install-x" type="button" aria-label="Not now" onClick={close}>×</button>
      <div className="install-row">
        <img src="/icons/icon-192.png" alt="" width="48" height="48" />
        <div><b>Add the portal to your home screen</b><span>It opens like an app, ready on the job site.</span></div>
      </div>
      {kind === "android" && (deferred
        ? <button className="btn" type="button" onClick={install}>Install app</button>
        : <p className="install-steps">Tap the <b>⋮</b> menu, then <b>Add to Home screen</b> (or <b>Install app</b>).</p>)}
      {kind === "ios" && <p className="install-steps">Tap <b>Share</b> <span className="ios-share" aria-hidden="true" /> at the bottom of Safari, then <b>Add to Home Screen</b>.</p>}
      {kind === "ios-other-browser" && <p className="install-steps">Open this page in <b>Safari</b>, tap <b>Share</b>, then <b>Add to Home Screen</b>.</p>}
      <button className="install-later" type="button" onClick={close}>Not now</button>
    </div>
  );
}
