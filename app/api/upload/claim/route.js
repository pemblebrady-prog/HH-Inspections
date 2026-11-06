import { NextResponse } from "next/server";
import { requireUser, createAdminClient } from "../../../../lib/supabase/server";
import { getDrive } from "../../../../lib/drive";
import { isStagedBy, claimStaged } from "../../../../lib/staging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// On submit: move a photo that went ahead into the job's folder. Body: { id, folderId, filename }
// 404 = the early copy is gone; the phone then uploads the photo normally.
export async function POST(req) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const drive = getDrive();
  if (!drive || !auth.profile) return NextResponse.json({ ok: false, error: "Not available" }, { status: 404 });
  let b; try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 }); }
  const id = String(b.id || ""), folderId = String(b.folderId || ""), name = String(b.filename || "photo.jpg").slice(0, 200);
  if (!id || !folderId) return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });

  // The job folder must belong to a job this person submitted (or an admin's).
  const db = createAdminClient();
  if (db) {
    const { data: sub } = await db.from("submissions").select("inspector_id").eq("drive_folder_id", folderId).maybeSingle();
    if (!sub || (sub.inspector_id !== auth.profile.id && auth.profile.role !== "admin")) return NextResponse.json({ ok: false, error: "Not your job" }, { status: 404 });
  }
  const from = await isStagedBy(drive, auth.profile.id, id);
  if (!from) return NextResponse.json({ ok: false, error: "Early copy not found" }, { status: 404 });
  try {
    const f = await claimStaged(drive, id, from, folderId, name);
    return NextResponse.json({ ok: true, id: f.id, name: f.name });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Move failed" }, { status: 500 });
  }
}
