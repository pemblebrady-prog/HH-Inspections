import { NextResponse } from "next/server";
import { requireUser, createAdminClient } from "./supabase/server";

const COLS = "id, name, email, phone, is_internal, price_cents, stripe_customer_id, payment_method_id, payment_method_label, payment_mandate_id, payment_status_note, payment_ready_at, default_payment";

// Which company's billing can this person manage? Owners: their own. Admins: any (companyId).
export async function billingContext(companyId) {
  const auth = await requireUser(["company_owner", "admin"]);
  if (auth.error) return { error: auth.error };
  const db = createAdminClient();
  if (!auth.profile || !db) return { error: NextResponse.json({ ok: false, error: "Sign-in isn't configured." }, { status: 500 }) };
  const id = auth.profile.role === "admin" ? (companyId || auth.profile.company_id) : auth.profile.company_id;
  if (!id) return { error: NextResponse.json({ ok: false, error: "No company selected." }, { status: 400 }) };
  const { data: company, error } = await db.from("companies").select(COLS).eq("id", id).maybeSingle();
  if (error || !company) return { error: NextResponse.json({ ok: false, error: error ? error.message : "Company not found" }, { status: 404 }) };
  return { db, me: auth.profile, company };
}

export function publicBilling(company) {
  return {
    companyId: company.id, name: company.name, internal: company.is_internal, price_cents: company.price_cents,
    method: company.payment_method_label || null, type: company.default_payment || null,
    ready: Boolean(company.payment_ready_at), note: company.payment_status_note || null,
  };
}
