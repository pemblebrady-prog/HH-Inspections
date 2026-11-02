import { NextResponse } from "next/server";
import { requireUser, createAdminClient } from "../../../../lib/supabase/server";
import { generateLetter } from "../../../../lib/letters";
import { chargeSubmission } from "../../../../lib/charges";

export const runtime = "nodejs";
export const maxDuration = 60;

const MOVES = {
  start:   { status: "under_review" },
  certify: { status: "certified" },
  deliver: { status: "delivered" },
  reopen:  { status: "submitted" },
  cancel:  { status: "canceled" },
};

// Admins: change a job's status, save notes, or regenerate the draft letter.
// Body: { ref, action: "start"|"certify"|"deliver"|"reopen"|"cancel"|"notes"|"letter", notes? }
export async function PATCH(req) {
  const auth = await requireUser(["admin"]);
  if (auth.error) return auth.error;
  const db = createAdminClient();
  if (!db) return NextResponse.json({ ok: false, error: "Database isn't configured." }, { status: 500 });
  let b;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 }); }

  const { data: sub, error } = await db.from("submissions").select("*, company:companies(name, is_internal)").eq("ref", b.ref).maybeSingle();
  if (error || !sub) return NextResponse.json({ ok: false, error: "Job not found" }, { status: 404 });
  const me = auth.profile && auth.profile.id;
  const now = new Date().toISOString();

  try {
    let patch = {};
    if (MOVES[b.action]) {
      patch = { ...MOVES[b.action] };
      if (b.action === "start") patch.reviewed_by = me;
      if (b.action === "certify") { patch.certified_at = now; patch.reviewed_by = sub.reviewed_by || me; }
      if (b.action === "deliver") patch.delivered_at = now;
      if (b.action === "reopen") { patch.certified_at = null; patch.delivered_at = null; }
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
      const companyName = (sub.report && sub.report.inspectionCompany) || (sub.company && !sub.company.is_internal ? sub.company.name : "");
      const r = await generateLetter({ folderId: sub.drive_folder_id, report: sub.report || {}, companyName, images: sub.photos || [] });
      if (r.simulated) return NextResponse.json({ ok: false, error: "Google Drive isn't connected, so the letter can't be made." }, { status: 400 });
      patch = { letter_doc_id: r.docId, letter_link: r.docLink };
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
