import { NextResponse } from "next/server";
import { requireUser } from "../../../lib/supabase/server";
import { getDrive, uploadPhoto } from "../../../lib/drive";

export const runtime = "nodejs";

export async function POST(req) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const form = await req.formData();
  const folderId = form.get("folderId");
  const file = form.get("file");

  if (!file || typeof file === "string") {
    return NextResponse.json({ ok: false, error: "No file" }, { status: 400 });
  }

  const drive = await getDrive();
  // Simulated mode — pretend it worked so the demo flow completes.
  if (!drive || !folderId) {
    return NextResponse.json({ ok: true, simulated: true });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const override = form.get("filename");
    const name = (typeof override === "string" && override) || file.name || `photo-${Date.now()}.jpg`;
    // A retry after a dropped connection may have already landed: reuse it instead of duplicating.
    const safe = name.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    const found = await drive.files.list({
      q: `name = '${safe}' and '${String(folderId).replace(/'/g, "")}' in parents and trashed = false`,
      fields: "files(id, name)", supportsAllDrives: true, includeItemsFromAllDrives: true, pageSize: 1,
    });
    if (found.data.files && found.data.files.length) {
      return NextResponse.json({ ok: true, id: found.data.files[0].id, name: found.data.files[0].name, existing: true });
    }
    const res = await uploadPhoto(drive, folderId, name, file.type, buffer);
    return NextResponse.json({ ok: true, id: res.id, name: res.name });
  } catch (err) {
    console.error("upload error", err);
    return NextResponse.json({ ok: false, error: err.message || "Upload failed" }, { status: 500 });
  }
}
