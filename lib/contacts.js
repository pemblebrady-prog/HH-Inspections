// Who at a company gets an email: active company owners and office managers, unless they've turned
// that kind of email off on ☰ → Notifications. "payment_failed" (and any unknown kind) always goes out.
const SWITCHABLE = ["receipts", "reminders", "delivered", "statements"];

export async function companyContacts(db, companyId, kind) {
  if (!db || !companyId) return [];
  let r = await db.from("profiles").select("email, role, notify").eq("company_id", companyId).eq("active", true).in("role", ["company_owner", "company_office"]);
  if (r.error) r = await db.from("profiles").select("email, role").eq("company_id", companyId).eq("active", true).eq("role", "company_owner"); // before migration 0016
  return (r.data || [])
    .filter((p) => p.email && !(SWITCHABLE.includes(kind) && p.notify && p.notify[kind] === false))
    .map((p) => p.email);
}

// House & Home office: admins and office managers.
export async function officeEmails(db) {
  if (!db) return [];
  let r = await db.from("profiles").select("email").in("role", ["admin", "office_manager"]).eq("active", true);
  if (r.error) r = await db.from("profiles").select("email").eq("role", "admin").eq("active", true);
  return (r.data || []).map((p) => p.email).filter(Boolean);
}
