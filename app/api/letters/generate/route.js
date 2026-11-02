import { NextResponse } from "next/server";
import { requireUser, createAdminClient } from "../../../../lib/supabase/server";
import { generateLetter } from "../../../../lib/letters";

export const runtime = "nodejs";
export const maxDuration = 60;

// Called by the form right after photos upload: builds the draft letter and
// records the photo list + letter link on the submission.
export async function POST(req) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  let data;
  try { data = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 }); }

  const { folderId, ref, report, companyName, images } = data;
  const db = createAdminClient();
  try {
    // Only the person who submitted it (or an admin) can attach photos/letter to a job.
    let canRecord = false;
    if (db && ref) {
      const { data: sub } = await db.from("submissions").select("inspector_id").eq("ref", ref).maybeSingle();
      const me = auth.profile;
      canRecord = Boolean(sub && (!me || me.role === "admin" || sub.inspector_id === me.id));
    }
    if (canRecord) {
      await db.from("submissions").update({ photos: images || [], photo_count: (images || []).length }).eq("ref", ref);
    }
    const r = await generateLetter({ folderId, report, companyName, images });
    if (r.simulated) return NextResponse.json({ ok: true, simulated: true });
    if (canRecord) await db.from("submissions").update({ letter_doc_id: r.docId, letter_link: r.docLink }).eq("ref", ref);
    return NextResponse.json({ ok: true, ...r });
  } catch (err) {
    console.error("letter generation error", err);
    return NextResponse.json({ ok: false, error: err.message || "Letter generation failed" }, { status: 500 });
  }
}
