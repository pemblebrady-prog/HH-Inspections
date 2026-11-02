import { NextResponse } from "next/server";
import { requireUser, createAdminClient } from "../../../../lib/supabase/server";
import { chargeSubmission, sendSubmissionEmails } from "../../../../lib/charges";
import { alertNewSubmission } from "../../../../lib/alerts";
import { generateLetter } from "../../../../lib/letters";

export const runtime = "nodejs";
export const maxDuration = 60;

// Called by the phone once every photo has uploaded: record the photos, charge,
// tell the office, email confirmations, and build the draft letter. Safe to repeat.
export async function POST(req) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  let b;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 }); }
  const db = createAdminClient();
  if (!db || !b.ref) return NextResponse.json({ ok: true, simulated: true });

  const { data: sub } = await db.from("submissions").select("*").eq("ref", b.ref).maybeSingle();
  if (!sub) return NextResponse.json({ ok: false, error: "Submission not found" }, { status: 404 });
  const me = auth.profile;
  if (me && me.role !== "admin" && sub.inspector_id !== me.id) return NextResponse.json({ ok: false, error: "Not your submission" }, { status: 403 });

  const alreadyDone = sub.status !== "uploading" && (sub.letter_link || (Array.isArray(sub.photos) && sub.photos.length));
  if (alreadyDone) return NextResponse.json({ ok: true, ref: sub.ref, status: sub.status, already: true });

  const origin = new URL(req.url).origin;
  const images = Array.isArray(b.images) ? b.images.filter((x) => x && typeof x.id === "string").slice(0, 300) : [];
  await db.from("submissions").update({ photos: images, photo_count: images.length, status: "submitted" }).eq("id", sub.id);

  let outcome = { status: "submitted", payment_status: sub.payment_status };
  let company = null;
  if (sub.company_id) {
    const r = await db.from("companies").select("*").eq("id", sub.company_id).single();
    company = r.data;
  }
  if (!sub.is_demo) {
    try {
      outcome = await chargeSubmission(db, { submission: sub, company, origin });
      await db.from("submissions").update(outcome).eq("id", sub.id);
    } catch (e) { console.error("charge failed", e); }
    try {
      await alertNewSubmission(db, {
        ref: sub.ref, clientName: sub.client_name, propertyAddress: sub.property_address, inspectorName: sub.inspector_name,
        companyName: company && !company.is_internal ? company.name : (sub.report && sub.report.inspectionCompany), origin,
      });
      await sendSubmissionEmails(db, { submission: sub, company, inspectorEmail: me && me.email, outcome, origin });
    } catch (e) { console.error("finalize emails failed", e); }
  }

  // Draft letter (best effort).
  try {
    const companyName = (sub.report && sub.report.inspectionCompany) || (company && !company.is_internal ? company.name : "");
    const r = await generateLetter({ folderId: sub.drive_folder_id, report: sub.report || {}, companyName, images });
    if (!r.simulated) await db.from("submissions").update({ letter_doc_id: r.docId, letter_link: r.docLink }).eq("id", sub.id);
  } catch (e) { console.error("letter failed", e); }

  return NextResponse.json({ ok: true, ref: sub.ref, status: outcome.status, payment_status: outcome.payment_status });
}
