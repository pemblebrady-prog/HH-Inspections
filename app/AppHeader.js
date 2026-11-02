"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import UserMenu from "./UserMenu";

// Where the logo goes for each role.
export function homeFor(profile) {
  if (profile && profile.role === "admin") return "/admin/review";
  return "/";
}

function navFor(profile, minimal) {
  if (minimal || !profile) return [];
  const submit = { href: "/", label: "Submit a job" };
  if (profile.role === "admin") return [
    { href: "/admin/review", label: "Review queue" },
    submit,
    { href: "/admin/people", label: "People" },
    { href: "/companies", label: "Companies" },
    { href: "/tracker", label: "Old tracker" },
  ];
  if (profile.role === "company_owner") return [submit, { href: "/team", label: "My team" }, { href: "/billing", label: "Billing" }];
  return [submit];
}

// Shared top bar: ☰ menu, logo (to your home screen), and your profile button.
// Pass `profile` when the page has it; leave it undefined to look it up.
export default function AppHeader({ title, profile: given, right, wide, minimal }) {
  const [profile, setProfile] = useState(given);
  const [open, setOpen] = useState(false);
  const path = usePathname();

  useEffect(() => { setProfile(given); }, [given]);
  useEffect(() => {
    if (given !== undefined) return;
    fetch("/api/me").then((r) => r.json()).then((d) => setProfile(d.ok ? d.profile : null)).catch(() => setProfile(null));
  }, [given]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const items = navFor(profile, minimal);
  const isOn = (href) => (href === "/" ? path === "/" : path && path.startsWith(href));

  return (
    <>
    <header>
      <div className="bar" style={wide ? { maxWidth: 1080 } : null}>
        {profile && (
          <button className="hamburger" type="button" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)}>
            <span /><span /><span />
          </button>
        )}
        <a className="brand" href={homeFor(profile)}><b>House&nbsp;<span>&amp;</span>&nbsp;Home</b><span className="sub">{title}</span></a>
        <div className="who">{right}<UserMenu profile={profile} /></div>
      </div>
    </header>

      {/* Outside <header>: its blur effect would otherwise trap the fixed overlay. */}
      {open && (
        <div className="sidenav-wrap" onClick={() => setOpen(false)}>
          <nav className="sidenav" onClick={(e) => e.stopPropagation()} aria-label="Main menu">
            <div className="sidenav-head">
              <b>House &amp; Home</b>
              <button type="button" className="sidenav-close" aria-label="Close menu" onClick={() => setOpen(false)}>×</button>
            </div>
            {items.map((it) => <a key={it.href} href={it.href} className={isOn(it.href) ? "on" : ""}>{it.label}</a>)}
            {minimal && <p className="hint" style={{ padding: "6px 18px" }}>Finish setup to see the rest of the portal.</p>}
            <form action="/auth/signout" method="post"><button type="submit">Sign out</button></form>
          </nav>
        </div>
      )}
    </>
  );
}
