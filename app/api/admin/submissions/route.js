import { NextResponse } from "next/server";
import { requireUser, createAdminClient } from "../../../../lib/supabase/server";
import { generateLetter, companyForLetter } from "../../../../lib/letters";
import { ensureDeficiencyDraft } from "../../../../lib/deficiencyDraft";
import { chargeSubmission } from "../../../../lib/charges";
import { deliverFinalLetter } from "../../../../lib/delivery";
import { engineerForJob } from "../../../../lib/engineers";
import { recordLetter } from "../../../../lib/letterRecord";
import { isOffice, canEngineer } from "../../../../lib/roles";
import { emailCannotCertify } from "../../../../lib/cannotCertify";
import { listRounds, makeClearLetter } from "../../../../lib/corrections";

export const runtime = "nodejs";
export const maxDuration = 60;

const MOVES = {
  start:   { status: "under_review" },
  certify: { status: "certified" },
  deliver: { status: "delivered" },
  reopen:  { status: "submitted" },
  cancel:  { status: "canceled" },
};

// Staff: change a job's status, save notes, or regenerate the draft letter.
// Body: { ref, action: "start"|"certify"|"deliver"|"reopen"|"cancel"|"notes"|"letter", notes? }
export async function PATCH(req) {
  const auth = await requireUser(["admin", "engineer"]);
  if (auth.error) return auth.error;
  const db = createAdminClient();
  if (!db) return NextResponse.json({ ok: false, error: "Database isn't configured." }, { status: 500 });
  let b;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 }); }

  const { data: sub, error } = await db.from("submissions").select("*, company:companies(name, is_internal, phone, email)").eq("ref", b.ref).maybeSingle();
  if (error || !sub) return NextResponse.json({ ok: false, error: "Job not found" }, { status: 404 });
  const me = auth.profile && auth.profile.id;
  if (["charge", "waive"].includes(b.action) && auth.profile && !isOffice(auth.profile)) {
    return NextResponse.json({ ok: false, error: "Only admins can change payments." }, { status: 403 });
  }
  const now = new Date().toISOString();
  // House & Home office managers run the office side only (Nov 25): start review, notes, payments, send
  // the certified letter, close a cannot-certify job. Corrections, letters and certifying are the engineer's.
  const OFFICE_OK = ["start", "notes", "charge", "waive", "send", "close"];
  if (auth.profile && !canEngineer(auth.profile) && !OFFICE_OK.includes(b.action)) {
    return NextResponse.json({ ok: false, error: "Only the engineer or an admin can do that." }, { status: 403 });
  }

  try {
    let patch = {};
    if (MOVES[b.action]) {
      patch = { ...MOVES[b.action] };
      if (b.action === "start") patch.reviewed_by = me;
      if (b.action === "certify") { patch.certified_at = now; patch.reviewed_by = sub.reviewed_by || me; }
      if (b.action === "deliver") patch.delivered_at = now;
      if (b.action === "reopen") { patch.certified_at = null; patch.delivered_at = null; }
    } else if (b.action === "cannot_certify") { // { reason }
      const reason = String(b.reason || "").trim().slice(0, 1000);
      if (!reason) return NextResponse.json({ ok: false, error: "Say why it can't be certified. The office sees this." }, { status: 400 });
      if (["certified", "delivered", "canceled", "cannot_certify"].includes(sub.status)) return NextResponse.json({ ok: false, error: `This job is already ${sub.status.replace("_", " ")}.` }, { status: 400 });
      patch = { status: "cannot_certify", cannot_certify_reason: reason, cannot_certify_at: now, cannot_certify_by: me, reviewed_by: sub.reviewed_by || me };
      // A corrections round in progress is over.
      await db.from("correction_rounds").update({ status: "canceled" }).eq("submission_id", sub.id).in("status", ["draft", "waiting", "awaiting_payment", "submitted"]).then(() => {}, () => {});
      const { error: e1 } = await db.from("submissions").update(patch).eq("id", sub.id);
      if (e1) {
        if (/cannot_certify/.test(e1.message || "")) return NextResponse.json({ ok: false, error: "Cannot certify needs a one-time database update (0019_cannot_certify.sql) first." }, { status: 400 });
        throw e1;
      }
      const results = await emailCannotCertify(db, { ...sub, ...patch }, { reason, engineerName: auth.profile && auth.profile.full_name, origin: new URL(req.url).origin });
      const { data: fresh } = await db.from("submissions").select("*").eq("id", sub.id).single();
      return NextResponse.json({ ok: true, submission: fresh, emailed: results.filter((r) => r.ok).map((r) => r.to) });
    } else if (b.action === "close") { // office: refunded (or nothing to refund) -> canceled
      if (sub.status !== "cannot_certify") return NextResponse.json({ ok: false, error: "Only a cannot-certify job is closed here." }, { status: 400 });
      if (sub.payment_status === "paid" && !b.force) return NextResponse.json({ ok: false, needsConfirm: true, error: "This job is still marked paid. Refund it first, or close it anyway?" });
      patch = { status: "canceled" };
    } else if (b.action === "review_again") { // engineer changed their mind
      if (sub.status !== "cannot_certify") return NextResponse.json({ ok: false, error: "This job isn't marked cannot certify." }, { status: 400 });
      patch = { status: "under_review", cannot_certify_reason: null, cannot_certify_at: null, cannot_certify_by: null };
    } else if (b.action === "send") {
      // The engineer signs off first: only certified (or already delivered) jobs can be sent.
      if (!["certified", "delivered"].includes(sub.status)) return NextResponse.json({ ok: false, error: "Mark this job certified before sending the final letter." }, { status: 400 });
      const r = await deliverFinalLetter(db, sub, { recipients: b.recipients, force: Boolean(b.force), sentBy: me });
      if (r.needsConfirm) return NextResponse.json({ ok: false, needsConfirm: true, problems: r.problems });
      if (!r.ok) return NextResponse.json({ ok: false, error: "Couldn't send to anyone: " + r.results.map((x) => `${x.to}: ${x.error}`).join("; "), results: r.results }, { status: 400 });
      const { data: fresh } = await db.from("submissions").select("*").eq("id", sub.id).single();
      return NextResponse.json({ ok: true, submission: fresh, results: r.results, pdfLink: r.pdfLink, stamped: r.stamped, clear: r.clear });
    } else if (b.action === "waive") {
      patch = { payment_status: "waived", ...(sub.status === "on_hold" ? { status: "submitted" } : {}) };
    } else if (b.action === "charge") {
      if (["paid", "processing"].includes(sub.payment_status)) return NextResponse.json({ ok: false, error: "Already paid or processing." }, { status: 400 });
      const { data: company } = await db.from("companies").select("*").eq("id", sub.company_id).single();
      patch = await chargeSubmission(db, { submission: sub, company, origin: new URL(req.url).origin, attempt: Date.now() });
      if (patch.payment_status === "unpaid") return NextResponse.json({ ok: false, error: "This company has no usable payment method on file." }, { status: 400 });
    } else if (b.action === "notes") {
      patch = { review_notes: String(b.notes || "").slice(0, 5000) };
    } else if (b.action === "letter") {
      // Regenerating: the engineer clicking it (if they're an engineer) signs it; otherwise the reviewer / main engineer.
      // After a corrections letter and follow-up, the job's letter is the clear letter.
      const { rounds } = await listRounds(db, sub.id);
      const last = rounds.filter((r) => r.status !== "canceled").pop();
      if (last && last.status === "cleared") {
        const r = await makeClearLetter(db, sub, last, auth.profile);
        await recordLetter(db, ["id", sub.id], r);
        const { data: fresh } = await db.from("submissions").select("*").eq("id", sub.id).single();
        return NextResponse.json({ ok: true, submission: fresh });
      }
      const signer = auth.profile && auth.profile.role === "engineer" ? { ...sub, letter_engineer_id: auth.profile.id } : { ...sub, letter_engineer_id: null };
      const engineer = await engineerForJob(db, signer);
      await ensureDeficiencyDraft(db, sub);
      const r = await generateLetter({ folderId: sub.drive_folder_id, report: sub.report || {}, company: await companyForLetter(db, sub), images: sub.photos || [], engineer });
      if (r.simulated) return NextResponse.json({ ok: false, error: "Google Drive isn't connected, so the letter can't be made." }, { status: 400 });
      await recordLetter(db, ["id", sub.id], r);
      const { data: fresh } = await db.from("submissions").select("*").eq("id", sub.id).single();
      return NextResponse.json({ ok: true, submission: fresh });
    } else {
      return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
    }
    const { data: updated, error: upErr } = await db.from("submissions").update(patch).eq("id", sub.id).select("*").single();
    if (upErr) throw upErr;
    return NextResponse.json({ ok: true, submission: updated });
  } catch (err) {
    console.error("review action error", err);
    return NextResponse.json({ ok: false, error: err.message || "Update failed" }, { status: 500 });
  }
}
