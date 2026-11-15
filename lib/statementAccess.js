// Owners see their own company's statements; admins any company.
export function statementCompanyId(profile, requested) {
  if (!profile) return null;
  if (profile.role === "admin") return requested || null;
  if (profile.role === "company_owner") return profile.company_id || null;
  return null;
}
