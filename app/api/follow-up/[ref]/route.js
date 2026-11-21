import { NextResponse } from "next/server";
import { requireUser, createAdminClient } from "../../../../lib/supabase/server";
import { listRounds, openRound, canDoFollowup, saveFollowupPhoto, submitFollowup, MISSING } from "../../../../lib/corrections";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const bad = (error, status = 400) => NextResponse.json({ ok: false, error }, { status });

async function load(ref) {
  const auth = await requireUser();
  if (auth.error) return { error: auth.error };
  const db = createAdminClient();
  if (!db) return { error: bad("Database isn't configured.", 500) };
  const { data: sub } = await db.from("submissions").select("*").eq("ref", ref).maybeSingle();
  if (!sub) return { error: bad("Job not found.", 404) };
  const { rounds, missing } = await listRounds(db, sub.id);
  if (missing) return { error: bad(MISSING, 500) };
  const round = openRound(rounds);
  if (!round || !canDoFollowup(auth.profile, sub, round)) return { error: bad("There's no follow-up for you on this job.", 404) };
  return { db, me: auth.profile, sub, round };
}

// One follow-up photo (multipart: file, name). Saved to the job's "Follow-up N" Drive folder.
export async function POST(req, { params }) {
  const c = await load(decodeURIComponent(params.ref)); if (c.error) return c.error;
  if (c.round.status !== "waiting") return bad("This follow-up was already sent.");
  const form = await req.formData();
  const file = form.get("file");
  if (!file || typeof file === "string") return bad("No file");
  if (file.size > 6 * 1024 * 1024) return bad("Photo too large");
  if (file.type && !/^image\//.test(file.type)) return bad("Photos only");
  const raw = String(form.get("name") || file.name || "photo.jpg");
  const name = raw.replace(/[^\w .()-]/g, "_").slice(0, 120) || "photo.jpg";
  try {
    const r = await saveFollowupPhoto(c.sub, c.round, { name, type: file.type || "image/jpeg", buffer: Buffer.from(await file.arrayBuffer()) });
    return NextResponse.json({ ok: true, id: r.id, simulated: Boolean(r.simulated) });
  } catch (e) {
    console.error("follow-up upload error", e);
    return bad(e.message || "Upload failed", 500);
  }
}

// Send the follow-up. Body: { items: [{ note, photos: [{ id }] }], extra: [{ id }], notes, date }
export async function PUT(req, { params }) {
  const c = await load(decodeURIComponent(params.ref)); if (c.error) return c.error;
  let b; try { b = await req.json(); } catch { return bad("Bad request"); }
  try {
    const r = await submitFollowup(c.db, c.sub, c.round, { items: b.items, extra: b.extra, notes: b.notes, date: b.date, by: c.me && c.me.id, origin: new URL(req.url).origin });
    return NextResponse.json({ ok: true, needsPayment: Boolean(r.needsPayment), amount: r.amount || 0, feeStatus: r.round.fee_status, round: r.round.id });
  } catch (e) {
    return bad(e.message || "Couldn't send the follow-up");
  }
}
