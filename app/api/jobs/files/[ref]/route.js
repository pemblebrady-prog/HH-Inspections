import { NextResponse } from "next/server";
import { requireUser, createAdminClient } from "../../../../../lib/supabase/server";
import { getDrive } from "../../../../../lib/drive";
import { canSeeJob } from "../../../../../lib/jobAccess";
import { isStaff, canEngineer } from "../../../../../lib/roles";
import { canAddToJob, addJobFile, removeJobFile, alertFilesAdded, moveJobFiles } from "../../../../../lib/jobFiles";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const bad = (error, status = 400) => NextResponse.json({ ok: false, error }, { status });

async function load(ref, { write } = {}) {
  const auth = await requireUser();
  if (auth.error) return { error: auth.error };
  const db = createAdminClient();
  if (!db) return { error: bad("Database isn't configured.", 500) };
  const { data: sub } = await db.from("submissions").select("*").eq("ref", ref).maybeSingle();
  if (!sub || !canSeeJob(auth.profile, sub)) return { error: bad("Job not found.", 404) };
  if (write && !canAddToJob(auth.profile, sub)) return { error: bad(sub.status === "canceled" ? "This job was canceled." : "This job is already certified, so its photos can't change. Call House & Home if something's missing.", 403) };
  return { db, me: auth.profile, sub };
}

// A photo on this job (so inspectors can see their job's photos). ?id=<Drive file id>
export async function GET(req, { params }) {
  const c = await load(decodeURIComponent(params.ref)); if (c.error) return c.error;
  const id = new URL(req.url).searchParams.get("id") || "";
  if (!(c.sub.photos || []).some((p) => p.id === id)) return new Response("Not found", { status: 404 });
  const drive = await getDrive();
  if (!drive) return new Response("Not found", { status: 404 });
  try {
    const meta = await drive.files.get({ fileId: id, fields: "mimeType", supportsAllDrives: true });
    const mime = meta.data.mimeType || "image/jpeg";
    if (!mime.startsWith("image/")) return new Response("Not an image", { status: 400 });
    const res = await drive.files.get({ fileId: id, alt: "media", supportsAllDrives: true }, { responseType: "arraybuffer" });
    return new Response(Buffer.from(res.data), { headers: { "Content-Type": mime, "Cache-Control": "private, max-age=3600" } });
  } catch { return new Response("Not found", { status: 404 }); }
}

// Add one file. Multipart: file, slot, replace ("1" to replace the slot's photos), sketchData (JSON, drawn sketch).
export async function POST(req, { params }) {
  const c = await load(decodeURIComponent(params.ref), { write: true }); if (c.error) return c.error;
  const form = await req.formData();
  const file = form.get("file");
  if (!file || typeof file === "string") return bad("No file");
  if (file.size > 4.2 * 1024 * 1024) return bad("Photo too large");
  if (file.type && !/^image\//.test(file.type)) return bad("Photos only");
  let sketchData = null;
  const raw = form.get("sketchData");
  if (typeof raw === "string" && raw) { try { sketchData = JSON.parse(raw); } catch { return bad("Bad drawing"); } if (raw.length > 200000) return bad("Drawing too large"); }
  try {
    const r = await addJobFile(c.db, c.sub, {
      slot: String(form.get("slot") || ""), name: file.name, type: file.type || "image/jpeg", buffer: Buffer.from(await file.arrayBuffer()),
      replace: form.get("replace") === "1", by: c.me && c.me.id, sketchData,
    });
    return NextResponse.json({ ok: true, photo: r.photo, photos: r.photos });
  } catch (e) { return bad(e.message || "Upload failed", e.code ? 500 : 400); }
}

// Take a photo off the job. Body: { id }
export async function DELETE(req, { params }) {
  const c = await load(decodeURIComponent(params.ref), { write: true }); if (c.error) return c.error;
  let b; try { b = await req.json(); } catch { return bad("Bad request"); }
  try { return NextResponse.json({ ok: true, ...(await removeJobFile(c.db, c.sub, String(b.id || ""))) }); }
  catch (e) { return bad(e.message, e.code ? 500 : 400); }
}

// Done changing: tell House & Home (when an inspector made the change). Body: { added, removed }
export async function PUT(req, { params }) {
  const c = await load(decodeURIComponent(params.ref), { write: true }); if (c.error) return c.error;
  let b; try { b = await req.json(); } catch { return bad("Bad request"); }
  const added = Math.max(0, Number(b.added) || 0), removed = Math.max(0, Number(b.removed) || 0);
  if ((added || removed) && !isStaff(c.me)) {
    await alertFilesAdded(c.db, c.sub, { by: c.me && (c.me.full_name || c.me.email), added, removed, origin: new URL(req.url).origin });
  }
  return NextResponse.json({ ok: true });
}

// Staff: sort photos into sections. Body: { ids: [photo ids], slot }
export async function PATCH(req, { params }) {
  const c = await load(decodeURIComponent(params.ref)); if (c.error) return c.error;
  if (!canEngineer(c.me)) return bad("Only the engineer or an admin can sort photos.", 403);
  let b; try { b = await req.json(); } catch { return bad("Bad request"); }
  try {
    const r = await moveJobFiles(c.db, c.sub, b.ids, String(b.slot || ""));
    return NextResponse.json({ ok: true, photos: r.photos });
  } catch (e) { return bad(e.message || "Couldn't move the photos", e.code ? 500 : 400); }
}
