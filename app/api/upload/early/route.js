import { NextResponse } from "next/server";
import { requireUser } from "../../../../lib/supabase/server";
import { getDrive } from "../../../../lib/drive";
import { stagePhoto, isStagedBy } from "../../../../lib/staging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Send one photo ahead while the form is being filled in. Multipart: photoId, file.
export async function POST(req) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const drive = await getDrive();
  if (!drive || !auth.profile) return NextResponse.json({ ok: true, off: true }); // no Drive / no login: send on submit instead
  const form = await req.formData();
  const photoId = String(form.get("photoId") || "");
  const file = form.get("file");
  if (!/^[\w-]{6,80}$/.test(photoId) || !file || typeof file === "string") return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  if (file.size > 4 * 1024 * 1024) return NextResponse.json({ ok: false, error: "Photo too large" }, { status: 400 });
  try {
    const id = await stagePhoto(drive, auth.profile.id, photoId, file.type, Buffer.from(await file.arrayBuffer()));
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Upload failed" }, { status: 500 });
  }
}

// A photo was removed before submitting: delete the copy that went ahead. Body: { id }
export async function DELETE(req) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const drive = await getDrive();
  if (!drive || !auth.profile) return NextResponse.json({ ok: true });
  let b; try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 }); }
  const id = String(b.id || "");
  if (id && (await isStagedBy(drive, auth.profile.id, id))) await drive.files.delete({ fileId: id, supportsAllDrives: true }).catch(() => {});
  return NextResponse.json({ ok: true });
}
