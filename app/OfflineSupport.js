"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { GUIDES } from "../lib/helpGuides";

const SKIP_WARM = ["/login", "/welcome", "/auth", "/request", "/statement", "/privacy", "/terms", "/pay"];

// Ask the offline helper (public/sw.js) to save pages and files on this phone.
export function warmOffline(urls) {
  try {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.ready.then((reg) => { if (reg.active) reg.active.postMessage({ type: "warm", urls }); }).catch(() => {});
  } catch { /* not supported */ }
}

// Registers the offline helper, saves the form and Help for offline use, and shows a bar when there's no signal.
export default function OfflineSupport() {
  const path = usePathname() || "/";
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const on = () => setOffline(false), off = () => setOffline(true);
    setOffline(navigator.onLine === false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (path === "/login") { // signed out: forget the saved pages
      navigator.serviceWorker.ready.then((reg) => reg.active && reg.active.postMessage({ type: "clear" })).catch(() => {});
      return;
    }
    if (SKIP_WARM.some((p) => path === p || path.startsWith(p + "/")) || navigator.onLine === false) return;
    const t = setTimeout(() => {
      // The files this page is running on (loaded before the helper took over), plus the form and Help.
      const files = performance.getEntriesByType("resource").map((r) => r.name).filter((u) => u.includes("/_next/static/"));
      const help = ["/help", ...GUIDES.map((g) => `/help?guide=${g.role}`), ...GUIDES.flatMap((g) => g.steps.flatMap((s) => (s.shots || []).map((x) => x.src)))];
      warmOffline([...new Set(["/", "/jobs", "/api/companies", "/api/orders/mine", ...files, ...help])]);
    }, 4000);
    return () => clearTimeout(t);
  }, [path]);

  if (!offline) return null;
  return (
    <div className="offline-bar" role="status">
      <b>No signal.</b> Keep going: everything saves on this phone, and photos send when you're back in signal.
    </div>
  );
}
