import { NextResponse } from "next/server";
import { requireUser, createAdminClient } from "../../../../lib/supabase/server";
import { canSeeJob } from "../../../../lib/jobAccess";
import { awaitingCard, startCardPayment, markCardPaid } from "../../../../lib/payPerJob";
import { stripe } from "../../../../lib/stripe";
import { startFeePayment, markFeePaid } from "../../../../lib/corrections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function load(ref, req) {
  const auth = await requireUser();
  if (auth.error) return { error: auth.error };
  const db = createAdminClient();
  if (!db) return { error: NextResponse.json({ ok: false, error: "Database isn't configured." }, { status: 500 }) };
  const { data: sub } = await db.from("submissions").select("*").eq("ref", ref).maybeSingle();
  if (!sub) return { error: NextResponse.json({ ok: false, error: "Job not found." }, { status: 404 }) };
  const { data: company } = sub.company_id ? await db.from("companies").select("*").eq("id", sub.company_id).maybeSingle() : { data: null };
  // ?round=<id>: paying a re-inspection fee instead of the job itself.
  const roundId = new URL(req.url).searchParams.get("round");
  let round = null;
  if (roundId) {
    const { data } = await db.from("correction_rounds").select("*").eq("id", roundId).eq("submission_id", sub.id).maybeSingle();
    if (!data) return { error: NextResponse.json({ ok: false, error: "Payment not found." }, { status: 404 }) };
    round = data;
  }
  // The job's people, or (for a fee) whoever the follow-up was assigned to or sent by.
  const allowed = canSeeJob(auth.profile, sub) || (round && auth.profile && [round.assigned_to, round.followup_submitted_by].includes(auth.profile.id));
  if (!allowed) return { error: NextResponse.json({ ok: false, error: "Job not found." }, { status: 404 }) };
  return { db, me: auth.profile, sub, company, round };
}

// Start paying: returns the Stripe client secret for the card form.
export async function POST(req, { params }) {
  const c = await load(decodeURIComponent(params.ref), req); if (c.error) return c.error;
  if (c.round) {
    if (c.round.fee_status === "paid") return NextResponse.json({ ok: true, paid: true });
    if (!(c.round.fee_cents > 0) || !["unpaid", "failed"].includes(c.round.fee_status) || !c.company || c.company.is_internal) return NextResponse.json({ ok: false, error: "This fee isn't waiting for a payment." }, { status: 400 });
    try {
      const r = await startFeePayment(c.db, c.sub, c.round, c.company);
      if (r.alreadyPaid) return NextResponse.json({ ok: true, paid: true });
      return NextResponse.json({ ok: true, clientSecret: r.clientSecret, amount: r.amount, publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "" });
    } catch (e) { return NextResponse.json({ ok: false, error: e.message || "Couldn't start the payment." }, { status: 500 }); }
  }
  if (c.sub.payment_status === "paid") return NextResponse.json({ ok: true, paid: true });
  if (!awaitingCard(c.sub, c.company)) return NextResponse.json({ ok: false, error: "This job isn't waiting for a card payment." }, { status: 400 });
  try {
    const r = await startCardPayment(c.db, c.sub, c.company);
    if (r.alreadyPaid) return NextResponse.json({ ok: true, paid: true });
    return NextResponse.json({ ok: true, clientSecret: r.clientSecret, amount: r.amount, publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "" });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Couldn't start the payment." }, { status: 500 });
  }
}

// After the card form succeeds: check with Stripe and move the job into review.
export async function PATCH(req, { params }) {
  const c = await load(decodeURIComponent(params.ref), req); if (c.error) return c.error;
  let b; try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 }); }
  const id = String(b.paymentIntentId || "");
  if (!/^pi_\w+$/.test(id)) return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  const pi = await stripe("GET", `/payment_intents/${id}`);
  if (c.round) {
    if (!pi.metadata || pi.metadata.correction_round_id !== c.round.id) return NextResponse.json({ ok: false, error: "That payment doesn't match this fee." }, { status: 400 });
    if (pi.status !== "succeeded") return NextResponse.json({ ok: false, error: `Payment is ${pi.status.replace(/_/g, " ")}.` }, { status: 400 });
    await markFeePaid(c.db, pi, { origin: new URL(req.url).origin, payerEmail: c.me && c.me.email });
    return NextResponse.json({ ok: true, paid: true });
  }
  if (!pi.metadata || pi.metadata.submission_id !== c.sub.id) return NextResponse.json({ ok: false, error: "That payment doesn't match this job." }, { status: 400 });
  if (pi.status !== "succeeded") return NextResponse.json({ ok: false, error: `Payment is ${pi.status.replace(/_/g, " ")}.` }, { status: 400 });
  await markCardPaid(c.db, pi, { origin: new URL(req.url).origin, payerEmail: c.me && c.me.email });
  return NextResponse.json({ ok: true, paid: true });
}
