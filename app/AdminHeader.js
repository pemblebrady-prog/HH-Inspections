import UserMenu from "./UserMenu";

// Shared top bar for admin pages.
export default function AdminHeader({ title, profile }) {
  return (
    <header><div className="bar" style={{ maxWidth: 1080 }}>
      <a className="brand" href="/"><b>House&nbsp;<span>&amp;</span>&nbsp;Home</b><span className="sub">{title}</span></a>
      <div className="who">
        <a className="viewswitch hide-sm" href="/admin/review">Review</a>
        <a className="viewswitch hide-sm" href="/admin/people">People</a>
        <UserMenu profile={profile} />
      </div>
    </div></header>
  );
}
