import { isOffice, isCompanyManager } from "./roles";
// Owners see their own company's statements; admins any company.
export function statementCompanyId(profile, requested) {
  if (!profile) return null;
  if (isOffice(profile)) return requested || null;
  if (isCompanyManager(profile)) return profile.company_id || null;
  return null;
}
