import { NextResponse } from "next/server";
import { requireUser, createAdminClient } from "../../../../lib/supabase/server";
import { canSeeJob } from "../../../../lib/jobAccess";
import { awaitingCard, startCardPayment, markCardPaid } from "../../../../lib/payPerJob";
import { stripe } from "../../../../lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function load(ref) {
  const auth = await requireUser();
  if (auth.error) return { error: auth.error };
  const db = createAdminClient();
  if (!db) return { error: NextResponse.json({ ok: false, error: "Database isn't configured." }, { status: 500 }) };
  const { data: sub } = await db.from("submissions").select("*").eq("ref", ref).maybeSingle();
  if (!sub || !canSeeJob(auth.profile, sub)) return { error: NextResponse.json({ ok: false, error: "Job not found." }, { status: 404 }) };
  const { data: company } = sub.company_id ? await db.from("companies").select("*").eq("id", sub.company_id).maybeSingle() : { data: null };
  return { db, me: auth.profile, sub, company };
}

// Start paying: returns the Stripe client secret for the card form.
export async function POST(req, { params }) {
  const c = await load(decodeURIComponent(params.ref)); if (c.error) return c.error;
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
  const c = await load(decodeURIComponent(params.ref)); if (c.error) return c.error;
  let b; try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 }); }
  const id = String(b.paymentIntentId || "");
  if (!/^pi_\w+$/.test(id)) return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  const pi = await stripe("GET", `/payment_intents/${id}`);
  if (!pi.metadata || pi.metadata.submission_id !== c.sub.id) return NextResponse.json({ ok: false, error: "That payment doesn't match this job." }, { status: 400 });
  if (pi.status !== "succeeded") return NextResponse.json({ ok: false, error: `Payment is ${pi.status.replace(/_/g, " ")}.` }, { status: 400 });
  await markCardPaid(c.db, pi, { origin: new URL(req.url).origin, payerEmail: c.me && c.me.email });
  return NextResponse.json({ ok: true, paid: true });
}
