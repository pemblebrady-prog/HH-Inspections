export const STATUS = {
  on_hold:      { label: "On hold",      color: "#8a6d1f", bg: "#f9eeda" },
  submitted:    { label: "Needs review", color: "#A2382A", bg: "#fbebeb" },
  under_review: { label: "Under review", color: "#2C6E8C", bg: "#e7f1fb" },
  certified:    { label: "Certified",    color: "#3f7a52", bg: "#e5f4e4" },
  delivered:    { label: "Delivered",    color: "#5c6b74", bg: "#f0efec" },
  canceled:     { label: "Canceled",     color: "#5c6b74", bg: "#f0efec" },
};
export function StatusPill({ status }) {
  const s = STATUS[status] || { label: status, color: "#5c6b74", bg: "#f0efec" };
  return <span className="pill" style={{ color: s.color, background: s.bg }}>{s.label}</span>;
}
