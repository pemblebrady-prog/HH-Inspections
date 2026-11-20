// House & Home staff roles. Admins see everything; engineers review and certify jobs, and can submit their own.
export const STAFF_ROLES = ["admin", "engineer"];
export const isStaff = (p) => Boolean(p && STAFF_ROLES.includes(p.role));
export const isAdmin = (p) => Boolean(p && p.role === "admin");
export const ROLE_LABEL = { admin: "Admin", engineer: "Engineer", company_owner: "Company owner", inspector: "Inspector" };
