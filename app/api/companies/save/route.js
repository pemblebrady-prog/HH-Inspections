import { NextResponse } from "next/server";
import { getDrive, rootFolderId, uploadCompanyLogo, addOrUpdateCompany } from "../../../../lib/drive";

export const runtime = "nodejs";

export async function POST(req) {
  const form = await req.formData();
  const name = (form.get("name") || "").toString().trim();
  const phone = (form.get("phone") || "").toString().trim();
  const email = (form.get("email") || "").toString().trim();
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
    const companies = await addOrUpdateCompany(drive, rootFolderId(), { name, logoFileId, phone, email });
    return NextResponse.json({ ok: true, companies });
  } catch (err) {
    console.error("company save error", err);
    return NextResponse.json({ ok: false, error: err.message || "Save failed" }, { status: 500 });
  }
}
