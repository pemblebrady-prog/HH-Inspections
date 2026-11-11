"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const KEY = "hh-install-dismissed";
const REMIND_DAYS = 14;

function dismissedRecently() {
  try { const t = Number(localStorage.getItem(KEY) || 0); return t && Date.now() - t < REMIND_DAYS * 864e5; } catch { return false; }
}
function rememberDismiss() { try { localStorage.setItem(KEY, String(Date.now())); } catch { /* private mode */ } }

// On phones, offer to put the portal on the home screen (once, then every couple of weeks).
export default function InstallPrompt() {
  const path = usePathname() || "/";
  const [kind, setKind] = useState(null);     // "ios" | "ios-other-browser" | "android"
  const [deferred, setDeferred] = useState(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onBip = (e) => { e.preventDefault(); setDeferred(e); };
    window.addEventListener("beforeinstallprompt", onBip);
    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);

  useEffect(() => {
    if (path === "/login" || path.startsWith("/welcome") || path.startsWith("/auth") || path.startsWith("/request") || path.startsWith("/statement") || path === "/privacy" || path === "/terms") return;
    const ua = navigator.userAgent || "";
    const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
    if (standalone || dismissedRecently()) return;
    let k = null;
    if (/iPhone|iPod/i.test(ua) || (/iPad/i.test(ua))) k = /CriOS|FxiOS|EdgiOS|FBAN|FBAV|Instagram|Line\//i.test(ua) ? "ios-other-browser" : "ios";
    else if (/Android/i.test(ua)) k = "android";
    if (!k) return;
    setKind(k);
    const t = setTimeout(() => setShow(true), 1800);
    return () => clearTimeout(t);
  }, [path]);

  if (!show || !kind) return null;
  const close = () => { rememberDismiss(); setShow(false); };

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
