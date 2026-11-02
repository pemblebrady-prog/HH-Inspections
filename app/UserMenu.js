"use client";

// Signed-in person's menu: one compact button that opens a small panel,
// so it fits on a phone header. Renders nothing when logins are off.
export default function UserMenu({ profile }) {
  if (!profile) return null;
  const name = profile.full_name || profile.email;
  const initials = (profile.full_name || profile.email || "?")
    .split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
  const roleLabel = { admin: "Admin", company_owner: "Company owner", inspector: "Inspector" }[profile.role] || "";
  return (
    <details className="usermenu">
      <summary aria-label="Account menu"><span className="avatar">{initials}</span><span className="caret">▾</span></summary>
      <div className="usermenu-panel">
        <div className="um-who"><b>{name}</b><span>{profile.email}</span><span className="mono">{roleLabel}{profile.company && !profile.company.is_internal ? ` · ${profile.company.name}` : ""}</span></div>
        <a href="/">Submit a job</a>
        {profile.role === "company_owner" && <a href="/team">My team</a>}
        {profile.role === "admin" && <>
          <a href="/admin/review">Review queue</a>
          <a href="/tracker">Tracker</a>
          <a href="/admin/people">People</a>
          <a href="/companies">Companies</a>
        </>}
        <form action="/auth/signout" method="post"><button type="submit">Sign out</button></form>
      </div>
    </details>
  );
}
