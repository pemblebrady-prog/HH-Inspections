import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, authEnabled } from "./config";
import { withEffectivePrice } from "../pricing";
import { VIEW_AS_COOKIE, parseViewAs } from "../viewAs";

// Signed-in user's client (reads the session cookie).
export function createClient() {
  const cookieStore = cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll(list) {
        try { list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); }
        catch { /* called from a Server Component — middleware refreshes the session instead */ }
      },
    },
  });
}

// Server-only client with the secret key. Bypasses row-level security, so it
// must never be used in code that runs in the browser.
export function createAdminClient() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!SUPABASE_URL || !key) return null;
  return createSupabaseClient(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// The signed-in person's profile (role, company), or null.
// An admin who chose "View as" gets a preview profile (role/company swapped,
// viewingAs set); getRealProfile() always returns who they really are.
export async function getCurrentProfile() {
  const real = await getRealProfile();
  if (!real || real.role !== "admin") return real;
  let view = null;
  try { view = parseViewAs(cookies().get(VIEW_AS_COOKIE)?.value); } catch { /* no request cookies here */ }
  if (!view) return real;
  const admin = createAdminClient();
  let company = null;
  if (view.companyId) {
    const { data } = await admin.from("companies")
      .select("id, name, is_internal, price_cents, onboarded_at, phone, email, billing_contact, billing_address, billing_city, billing_state, billing_zip, logo_drive_file_id")
      .eq("id", view.companyId).maybeSingle();
    if (!data) return real; // company gone: ignore the preview
    company = { ...(await withEffectivePrice(admin, data)), pay_per_job: (await companyFlags(admin, data.id)).payPerJob };
  }
  return {
    ...real, role: view.role, company_id: company ? company.id : null, company,
    onboarded_at: real.onboarded_at || "preview",
    viewingAs: { role: view.role, companyName: company ? company.name : null }, realRole: "admin",
  };
}

export async function getRealProfile() {
  if (!authEnabled) return null;
  const { data: { user } } = await createClient().auth.getUser();
  if (!user) return null;
  const admin = createAdminClient();
  if (!admin) return null;
  const FULL = "id, email, full_name, phone, role, company_id, active, certificate_number, default_report_email, onboarded_at, "
    + "company:companies(id, name, is_internal, price_cents, onboarded_at, phone, email, billing_contact, billing_address, billing_city, billing_state, billing_zip, logo_drive_file_id)";
  const BASIC = "id, email, full_name, phone, role, company_id, active, company:companies(id, name, is_internal, price_cents)";
  let { data: profile, error } = await admin.from("profiles").select(FULL).eq("id", user.id).single();
  if (error && !profile) {
    // Onboarding columns not added yet (migration 0002 not run): fall back, and treat as set up.
    ({ data: profile } = await admin.from("profiles").select(BASIC).eq("id", user.id).single());
    if (profile) profile.onboarded_at = profile.onboarded_at || "n/a";
  }
  if (!profile || !profile.active) return null;
  if (profile.company_id) {
    // A company that's been turned off locks out everyone at it (admins excepted).
    const flags = await companyFlags(admin, profile.company_id);
    if (profile.role !== "admin" && flags.off) return null;
    if (profile.company) profile.company = { ...(await withEffectivePrice(admin, profile.company)), pay_per_job: flags.payPerJob };
  }
  return profile;
}

// Company switches that may not exist yet (older databases): off (0008), pay per job (0013).
export async function companyFlags(db, companyId) {
  if (!db || !companyId) return { off: false, payPerJob: false };
  let r = await db.from("companies").select("active, pay_per_job").eq("id", companyId).maybeSingle();
  if (r.error) r = await db.from("companies").select("active").eq("id", companyId).maybeSingle();
  const c = (!r.error && r.data) || {};
  return { off: c.active === false, payPerJob: c.pay_per_job === true };
}

// True when an admin has turned this company off. (False if migration 0008 isn't run yet.)
export async function companyIsOff(db, companyId) {
  if (!db || !companyId) return false;
  const { data, error } = await db.from("companies").select("active").eq("id", companyId).maybeSingle();
  return !error && data && data.active === false;
}

// For API routes: returns { profile } or { error: NextResponse }.
// When Supabase isn't configured yet, everything is allowed (dev/simulated mode).
export async function requireUser(roles) {
  if (!authEnabled) return { profile: null };
  const profile = await getCurrentProfile();
  if (!profile) return { error: NextResponse.json({ ok: false, error: "Please sign in." }, { status: 401 }) };
  if (roles && !roles.includes(profile.role)) {
    return { error: NextResponse.json({ ok: false, error: "You don't have access to this." }, { status: 403 }) };
  }
  return { profile };
}
