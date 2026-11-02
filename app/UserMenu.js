"use client";

// Profile button (initials) with who you are and Sign out. Navigation lives in the ☰ menu.
export default function UserMenu({ profile }) {
  if (!profile) return null;
  const name = profile.full_name || profile.email;
  const initials = (profile.full_name || profile.email || "?")
    .split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
  const roleLabel = { admin: "Admin", company_owner: "Company owner", inspector: "Inspector" }[profile.role] || "";
  return (
    <details className="usermenu">
      <summary aria-label="Account"><span className="avatar">{initials}</span><span className="caret">▾</span></summary>
      <div className="usermenu-panel">
        <div className="um-who"><b>{name}</b><span>{profile.email}</span><span className="mono">{roleLabel}{profile.company && !profile.company.is_internal ? ` · ${profile.company.name}` : ""}</span></div>
        {profile.role === "company_owner" && <a href="/billing">Billing</a>}
        <form action="/auth/signout" method="post"><button type="submit">Sign out</button></form>
      </div>
    </details>
  );
}
