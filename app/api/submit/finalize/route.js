import { NextResponse } from "next/server";
import { requireUser, createAdminClient } from "../../../../lib/supabase/server";
import { chargeSubmission, sendSubmissionEmails } from "../../../../lib/charges";
import { alertNewSubmission } from "../../../../lib/alerts";
import { generateLetter, companyForLetter } from "../../../../lib/letters";
import { ensureDeficiencyDraft } from "../../../../lib/deficiencyDraft";
import { engineerForJob } from "../../../../lib/engineers";
import { paysByCard } from "../../../../lib/payPerJob";
import { recordLetter } from "../../../../lib/letterRecord";
import { isOffice } from "../../../../lib/roles";

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
  if (me && !isOffice(me) && sub.inspector_id !== me.id) return NextResponse.json({ ok: false, error: "Not your submission" }, { status: 403 });

  const alreadyDone = sub.status !== "uploading" && (sub.letter_link || (Array.isArray(sub.photos) && sub.photos.length));
  const answerAlready = async () => {
    const { data: co } = sub.company_id ? await db.from("companies").select("*").eq("id", sub.company_id).maybeSingle() : { data: null };
    // A card-paying job that isn't paid yet needs the pay step, even if another request is still finishing it.
    const payNow = Boolean(paysByCard(co) && ["on_hold", "submitted"].includes(sub.status) && sub.amount_cents > 0
      && !["paid", "processing", "waived"].includes(sub.payment_status) && !sub.is_demo);
    return NextResponse.json({ ok: true, ref: sub.ref, status: payNow ? "on_hold" : sub.status, payment_status: sub.payment_status, already: true,
      pay_now: payNow, amount_cents: sub.amount_cents });
  };
  if (alreadyDone) return answerAlready();

  const origin = new URL(req.url).origin;
  const images = Array.isArray(b.images) ? b.images.filter((x) => x && typeof x.id === "string").slice(0, 300) : [];
  // Claim the job: only one finalize can move it out of "uploading", so a retry, a second tab or a
  // double tap never charges or emails twice. Whoever loses just reports the job's current state.
  const { data: claimed } = await db.from("submissions").update({ photos: images, photo_count: images.length, status: "submitted" })
    .eq("id", sub.id).eq("status", "uploading").select("id");
  if (!claimed || !claimed.length) {
    if (sub.status !== "uploading") { // older jobs created before this check: record the photos as before
      await db.from("submissions").update({ photos: images, photo_count: images.length }).eq("id", sub.id);
    } else {
      const { data: now } = await db.from("submissions").select("*").eq("id", sub.id).single();
      Object.assign(sub, now);
      return answerAlready();
    }
  }

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
    const payNow = Boolean(paysByCard(company) && outcome.status === "on_hold");
    try {
      // Pay-as-you-go jobs reach the engineer once paid (lib/payPerJob.js sends the alert then).
      if (!payNow) await alertNewSubmission(db, {
        ref: sub.ref, clientName: sub.client_name, propertyAddress: sub.property_address, inspectorName: sub.inspector_name,
        companyName: company && !company.is_internal ? company.name : (sub.report && sub.report.inspectionCompany), origin,
      });
      await sendSubmissionEmails(db, { submission: sub, company, inspectorEmail: me && me.email, outcome, origin });
    } catch (e) { console.error("finalize emails failed", e); }
  }

  // Draft letter (best effort).
  try {
    const engineer = await engineerForJob(db, sub);
    if (!sub.is_demo) await ensureDeficiencyDraft(db, sub); // inspector's deficiency notes in Ron's wording
    const r = await generateLetter({ folderId: sub.drive_folder_id, report: sub.report || {}, company: await companyForLetter(db, sub), images, engineer });
    if (!r.simulated) await recordLetter(db, ["id", sub.id], r);
  } catch (e) { console.error("letter failed", e); }

  const payNow = Boolean(paysByCard(company) && outcome.status === "on_hold" && !sub.is_demo);
  return NextResponse.json({ ok: true, ref: sub.ref, status: outcome.status, payment_status: outcome.payment_status, pay_now: payNow, amount_cents: sub.amount_cents });
}
