"use client";

// Shows who's signed in, with a sign-out button. Renders nothing when logins are off.
export default function UserMenu({ profile, links }) {
  if (!profile) return null;
  const name = profile.full_name || profile.email;
  return (
    <span className="usermenu">
      {links}
      {profile.role === "admin" && <><a className="viewswitch" href="/tracker">Tracker</a><a className="viewswitch" href="/admin/people">People</a></>}
      <span className="who-name" title={profile.email}>{name}</span>
      <form action="/auth/signout" method="post" style={{ display: "inline" }}>
        <button className="viewswitch" type="submit">Sign out</button>
      </form>
    </span>
  );
}
