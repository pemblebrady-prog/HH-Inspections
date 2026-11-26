import { NextResponse } from "next/server";
import { requireUser, createAdminClient } from "../../../../lib/supabase/server";
import { parseDollars } from "../../../../lib/pricing";
import { recordLetter } from "../../../../lib/letterRecord";
import { isOffice, canEngineer } from "../../../../lib/roles";
import {
  listRounds, openRound, startRound, updateRound, cancelRound, makeCorrectionsLetter, sendCorrectionsLetter,
  makeClearLetter, chargeFeeNow, refundFee, MISSING,
} from "../../../../lib/corrections";

export const runtime = "nodejs";
export const maxDuration = 60;

const bad = (error, status = 400) => NextResponse.json({ ok: false, error }, { status });
const fee = (v) => { const c = parseDollars(v); if (Number.isNaN(c)) throw new Error("Enter a fee like 35 or 0."); return c == null ? 0 : c; };

// Staff (engineers, admins, office managers): the failed-inspection flow on one job.
// Body: { ref, action, ... }
//   start   { corrections, followupBy, assignedTo, fee, redo } → saves the round and makes the corrections letter
//   update  { followupBy?, assignedTo?, fee?, corrections? }  · letter (remake the corrections letter)
//   send    { recipients, force } · cancel · clear (make the clear letter) · fee_charge · fee_waive (office only)
export async function POST(req) {
  const auth = await requireUser(["admin", "engineer"]);
  if (auth.error) return auth.error;
  const db = createAdminClient();
  if (!db) return bad("Database isn't configured.", 500);
  let b; try { b = await req.json(); } catch { return bad("Bad request"); }
  const { data: sub } = await db.from("submissions").select("*, company:companies(name, is_internal, phone, email)").eq("ref", String(b.ref || "")).maybeSingle();
  if (!sub) return bad("Job not found", 404);
  const me = auth.profile;
  const origin = new URL(req.url).origin;
  if (["fee_charge", "fee_waive", "fee_refund"].includes(b.action) && me && !isOffice(me)) return bad("Only the office can change payments.", 403);
  // Corrections are the engineer's (Nov 25): office managers only handle the re-inspection fee.
  if (!["fee_charge", "fee_waive", "fee_refund"].includes(b.action) && me && !canEngineer(me)) return bad("Only the engineer or an admin can do corrections.", 403);

  const { rounds, missing, error } = await listRounds(db, sub.id);
  if (missing) return bad(MISSING, 500);
  if (error) return bad(error, 500);
  const round = openRound(rounds);
  const latest = rounds[rounds.length - 1] || null;
  const reply = async (extra = {}) => {
    const { rounds: fresh } = await listRounds(db, sub.id);
    const { data: job } = await db.from("submissions").select("status, letter_link").eq("id", sub.id).single();
    return NextResponse.json({ ok: true, rounds: fresh, job, ...extra });
  };

  try {
    switch (b.action) {
      case "start": {
        if (["delivered", "canceled"].includes(sub.status)) return bad(`This job is ${sub.status}. Reopen it first.`);
        const r = await startRound(db, sub, { corrections: b.corrections, followupBy: b.followupBy, assignedTo: b.assignedTo || null, feeCents: fee(b.fee), by: me && me.id, redo: Boolean(b.redo) });
        if (sub.status === "submitted") await db.from("submissions").update({ status: "under_review", reviewed_by: sub.reviewed_by || (me && me.id) }).eq("id", sub.id);
        try { await makeCorrectionsLetter(db, sub, r, me); }
        catch (e) { return reply({ warning: `Saved, but the letter couldn't be made: ${e.message}` }); }
        return reply();
      }
      case "update": {
        if (!round) return bad("There's no corrections round to change.");
        await updateRound(db, sub, round, {
          followupBy: b.followupBy, assignedTo: b.assignedTo === undefined ? undefined : b.assignedTo || null,
          feeCents: b.fee === undefined ? undefined : fee(b.fee), corrections: b.corrections,
        }, { origin });
        return reply();
      }
      case "letter": {
        if (!round || round.status !== "draft") return bad("There's no corrections letter being prepared.");
        await makeCorrectionsLetter(db, sub, round, me);
        return reply();
      }
      case "send": {
        if (!round || round.status !== "draft") return bad("There's no corrections letter waiting to be sent.");
        const r = await sendCorrectionsLetter(db, sub, round, { recipients: b.recipients, force: Boolean(b.force), sentBy: me && me.id, origin });
        if (r.needsConfirm) return NextResponse.json({ ok: false, needsConfirm: true, problems: r.problems });
        if (!r.ok) return NextResponse.json({ ok: false, error: "Couldn't send to anyone: " + r.results.map((x) => `${x.to}: ${x.error}`).join("; "), results: r.results }, { status: 400 });
        return reply({ results: r.results, pdfLink: r.pdfLink, stamped: r.stamped });
      }
      case "cancel": {
        if (!round) return bad("There's no corrections round to cancel.");
        await cancelRound(db, sub, round);
        return reply();
      }
      case "clear": {
        const target = round && round.status === "submitted" ? round : latest && latest.status === "cleared" ? latest : null;
        if (!target) return bad("The follow-up hasn't come in yet.");
        if (round && round.status !== "submitted") return bad("Finish the open corrections round first.");
        const r = await makeClearLetter(db, sub, target, me);
        await recordLetter(db, ["id", sub.id], r);
        if (["submitted", "corrections"].includes(sub.status)) await db.from("submissions").update({ status: "under_review", reviewed_by: sub.reviewed_by || (me && me.id) }).eq("id", sub.id);
        return reply();
      }
      case "fee_charge":
      case "fee_waive": {
        const target = [...rounds].reverse().find((r) => r.fee_cents > 0 && ["unpaid", "failed"].includes(r.fee_status));
        if (!target) return bad("There's no unpaid re-inspection fee on this job.");
        if (b.action === "fee_waive") {
          await db.from("correction_rounds").update({ fee_status: "waived" }).eq("id", target.id);
          if (target.status === "awaiting_payment") {
            await db.from("correction_rounds").update({ status: "submitted" }).eq("id", target.id);
            await db.from("submissions").update({ status: "submitted" }).eq("id", sub.id);
          }
          return reply();
        }
        const r = await chargeFeeNow(db, sub, target, { origin });
        if (r.fee_status === "failed") return reply({ warning: "The charge didn't go through. The company has been emailed to update their payment method." });
        if (r.fee_status === "unpaid") return reply({ warning: "This company has no usable payment method on file." });
        return reply(r.emailed ? { message: `Pay link emailed to ${r.emailed.join(", ") || "no one (no contacts found)"}.` } : {});
      }
      case "fee_refund": { // { roundId, amount (dollars; blank = the rest), reason }
        const target = rounds.find((r) => r.id === b.roundId);
        if (!target || !(target.fee_cents > 0) || !["paid", "refunded"].includes(target.fee_status)) return bad("There's no paid re-inspection fee to refund.");
        const cents = b.amount === "" || b.amount == null ? null : parseDollars(b.amount);
        if (Number.isNaN(cents)) return bad("Enter an amount like 20 or 20.00.");
        await refundFee(db, sub, target, { amountCents: cents, reason: String(b.reason || "").trim().slice(0, 400), by: me && me.id });
        return reply({ message: "Refund sent. The company gets a receipt." });
      }
      default:
        return bad("Unknown action");
    }
  } catch (e) {
    if (!(e instanceof Error) || e.code) console.error("corrections action error", e); // database/Drive problems; plain messages are for the user
    return bad(e.message || "Something went wrong", e.code ? 500 : 400);
  }
}
