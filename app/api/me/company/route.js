import { NextResponse } from "next/server";
import { requireUser, createAdminClient } from "../../../../lib/supabase/server";
import { getDrive, rootFolderId, uploadCompanyLogo, addOrUpdateCompany } from "../../../../lib/drive";

export const runtime = "nodejs";
const s = (v) => String(v == null ? "" : v).trim();

// Company owner updates their own company's details and logo (multipart form).
export async function POST(req) {
  const auth = await requireUser(["company_owner", "admin"]);
  if (auth.error) return auth.error;
  const me = auth.profile;
  const db = createAdminClient();
  if (!me || !db) return NextResponse.json({ ok: false, error: "Sign-in isn't configured." }, { status: 500 });
  if (!me.company_id) return NextResponse.json({ ok: false, error: "Your account isn't linked to a company yet. Ask House & Home." }, { status: 400 });

  const form = await req.formData();
  const fields = {
    phone: s(form.get("phone")), email: s(form.get("email")).toLowerCase(),
    billing_contact: s(form.get("billingContact")), billing_address: s(form.get("billingAddress")),
    billing_city: s(form.get("billingCity")), billing_state: s(form.get("billingState")) || "AZ", billing_zip: s(form.get("billingZip")),
  };
  if (fields.phone.replace(/\D/g, "").length < 10) return NextResponse.json({ ok: false, error: "Enter the company's 10-digit phone number." }, { status: 400 });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(fields.email)) return NextResponse.json({ ok: false, error: "Enter the company's email." }, { status: 400 });
  if (!fields.billing_address || !fields.billing_city || !fields.billing_zip) return NextResponse.json({ ok: false, error: "Enter the billing address, city and ZIP." }, { status: 400 });

  try {
    const { data: company, error: cErr } = await db.from("companies").select("id, name").eq("id", me.company_id).single();
    if (cErr) throw cErr;

    // Logo goes to Drive (where the letter generator reads it from).
    const drive = getDrive();
    const file = form.get("logo");
    if (drive && file && typeof file !== "string" && file.size > 0) {
      const buffer = Buffer.from(await file.arrayBuffer());
      fields.logo_drive_file_id = await uploadCompanyLogo(drive, rootFolderId(), `${company.name}-logo.png`, file.type, buffer);
    }

    const { error } = await db.from("companies").update(fields).eq("id", company.id);
    if (error) throw error;

    // Keep the Drive company list in sync until letters/statements read from the database.
    if (drive) {
      try {
        await addOrUpdateCompany(drive, rootFolderId(), {
          name: company.name, logoFileId: fields.logo_drive_file_id, phone: fields.phone, email: fields.email,
          billingContact: fields.billing_contact, billingAddress: fields.billing_address,
          billingCity: fields.billing_city, billingState: fields.billing_state, billingZip: fields.billing_zip,
        });
      } catch (e) { console.error("drive company sync failed", e); }
    }
    return NextResponse.json({ ok: true, logoSaved: Boolean(fields.logo_drive_file_id) });
  } catch (err) {
    console.error("company save error", err);
    return NextResponse.json({ ok: false, error: err.message || "Save failed" }, { status: 500 });
  }
}
