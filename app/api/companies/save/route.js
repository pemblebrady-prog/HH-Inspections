import { NextResponse } from "next/server";
import { getDrive, rootFolderId, uploadCompanyLogo, addOrUpdateCompany } from "../../../../lib/drive";

export const runtime = "nodejs";

export async function POST(req) {
  const form = await req.formData();
  const name = (form.get("name") || "").toString().trim();
  const phone = (form.get("phone") || "").toString().trim();
  const email = (form.get("email") || "").toString().trim();
  const billingContact = (form.get("billingContact") || "").toString().trim();
  const billingAddress = (form.get("billingAddress") || "").toString().trim();
  const billingCity = (form.get("billingCity") || "").toString().trim();
  const billingState = (form.get("billingState") || "").toString().trim();
  const billingZip = (form.get("billingZip") || "").toString().trim();
  const file = form.get("logo");

  if (!name) return NextResponse.json({ ok: false, error: "Company name is required." }, { status: 400 });

  const drive = getDrive();
  if (!drive) return NextResponse.json({ ok: true, simulated: true });

  try {
    let logoFileId = null;
    if (file && typeof file !== "string") {
      const buffer = Buffer.from(await file.arrayBuffer());
      logoFileId = await uploadCompanyLogo(drive, rootFolderId(), file.name || `${name}-logo.png`, file.type, buffer);
    }
    const companies = await addOrUpdateCompany(drive, rootFolderId(), { name, logoFileId, phone, email, billingContact, billingAddress, billingCity, billingState, billingZip });
    return NextResponse.json({ ok: true, companies });
  } catch (err) {
    console.error("company save error", err);
    return NextResponse.json({ ok: false, error: err.message || "Save failed" }, { status: 500 });
  }
}
