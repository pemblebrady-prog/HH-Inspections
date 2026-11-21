// Two-layer roles (Nov 2026). Each person can have:
//   a site-wide role (House & Home staff): admin | office_manager | engineer
//   a company role at one company:         company_owner | office_manager | inspector
// Staff can hold a company role only at House & Home. `profile.role` is worked out from the two
// (database trigger): admin, office_manager, engineer, company_owner, company_office, inspector.
export const SITE_ROLES = [["admin", "Admin"], ["office_manager", "Office manager"], ["engineer", "Engineer"]];
export const COMPANY_ROLES = [["company_owner", "Company owner"], ["office_manager", "Office manager"], ["inspector", "Inspector"]];

export const STAFF_ROLES = ["admin", "office_manager", "engineer"];
export const OFFICE_ROLES = ["admin", "office_manager"]; // run the business: orders, people, companies, money
export const COMPANY_MANAGER_ROLES = ["company_owner", "company_office"];

export const isStaff = (p) => Boolean(p && STAFF_ROLES.includes(p.role));
export const isAdmin = (p) => Boolean(p && p.role === "admin");
export const isOffice = (p) => Boolean(p && OFFICE_ROLES.includes(p.role));
export const isCompanyManager = (p) => Boolean(p && COMPANY_MANAGER_ROLES.includes(p.role));

export const ROLE_LABEL = {
  admin: "Admin", office_manager: "Office manager", engineer: "Engineer",
  company_owner: "Company owner", company_office: "Office manager", inspector: "Inspector",
};
export const SITE_LABEL = Object.fromEntries(SITE_ROLES);
export const COMPANY_LABEL = Object.fromEntries(COMPANY_ROLES);

// The derived `role` for a site role + company role (same rule as the database trigger).
export function deriveRole(siteRole, companyRole) {
  if (siteRole) return siteRole;
  if (companyRole === "office_manager") return "company_office";
  return companyRole || "inspector";
}

// Accepting "admin" also accepts office managers, and "company_owner" also accepts company
// office managers. Use "admin!" for the few admin-only things (Google & email, site-wide roles).
export function roleAllowed(role, roles) {
  if (!roles) return true;
  if (roles.includes(role)) return true;
  if (role === "office_manager" && roles.includes("admin")) return true;
  if (role === "company_office" && roles.includes("company_owner")) return true;
  if (role === "admin" && roles.includes("admin!")) return true;
  return false;
}

// Email kinds company owners and office managers can turn off (payment failed is always on).
export const NOTIFY_KINDS = [
  ["receipts", "Payment receipts", "A receipt each time a job is charged or paid."],
  ["reminders", "Unpaid job reminders", "A reminder with a pay link when a job is still waiting for payment."],
  ["delivered", "Final reports", "A copy of each certified letter when it's sent."],
  ["statements", "Monthly statements", "The summary of last month's jobs, on the 1st."],
];
