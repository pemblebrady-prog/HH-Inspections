"use client";
import { ViewAsPicker } from "./ViewAs";
import { ROLE_LABEL, COMPANY_LABEL } from "../lib/roles";

// Profile button (initials) with who you are and Sign out. Navigation lives in the ☰ menu.
export default function UserMenu({ profile }) {
  if (!profile) return null;
  const name = profile.full_name || profile.email;
  const initials = (profile.full_name || profile.email || "?")
    .split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
  const roleLabel = ROLE_LABEL[profile.role] || "";
  // Staff who also have a role at House & Home, e.g. "Engineer · Inspector at House & Home".
  const extra = profile.site_role && profile.company_role && profile.company ? ` · ${COMPANY_LABEL[profile.company_role]} at ${profile.company.name}` : "";
  return (
    <details className="usermenu">
      <summary aria-label="Account"><span className="avatar">{initials}</span><span className="caret">▾</span></summary>
      <div className="usermenu-panel">
        <div className="um-who"><b>{name}</b><span>{profile.email}</span><span className="mono">{profile.viewingAs ? `Admin · previewing as ${roleLabel}` : roleLabel + extra}{profile.company && !profile.company.is_internal ? ` · ${profile.company.name}` : ""}</span></div>
        {(profile.role === "admin" || profile.realRole === "admin") && <ViewAsPicker current={profile.viewingAs || null} />}
        {(profile.role === "company_owner" || profile.role === "company_office") && <><a href="/billing">Billing</a><a href="/notifications">Notifications</a></>}
        <form action="/auth/signout" method="post"><button type="submit">Sign out</button></form>
      </div>
    </details>
  );
}
