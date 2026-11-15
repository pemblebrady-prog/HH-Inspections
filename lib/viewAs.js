// "View as": an admin previews the portal as another role without signing out.
// Stored in a cookie; only honored when the real signed-in person is an admin.
// While previewing, the middleware blocks every change (charges, emails, saves).
export const VIEW_AS_COOKIE = "hh_view_as";
export const VIEW_ROLES = ["engineer", "company_owner", "inspector"];

// Cookie value: "engineer" | "company_owner:<companyId>" | "inspector:<companyId>"
export function parseViewAs(value) {
  const [role, companyId] = String(value || "").split(":");
  if (!VIEW_ROLES.includes(role)) return null;
  if (role !== "engineer" && !/^[0-9a-f-]{36}$/i.test(companyId || "")) return null;
  return { role, companyId: role === "engineer" ? null : companyId };
}
