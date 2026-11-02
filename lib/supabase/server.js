import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, authEnabled } from "./config";

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
export async function getCurrentProfile() {
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
  return profile;
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
