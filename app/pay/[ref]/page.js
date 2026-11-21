import { redirect, notFound } from "next/navigation";
import { getCurrentProfile, createAdminClient } from "../../../lib/supabase/server";
import { canSeeJob } from "../../../lib/jobAccess";
import AppHeader from "../../AppHeader";
import PayClient from "./PayClient";

export const dynamic = "force-dynamic";

// /pay/HH-1015 — pay-as-you-go: pay for one job by card, then it goes to the engineer.
export default async function PayPage({ params, searchParams }) {
  const ref = decodeURIComponent(params.ref);
  const profile = await getCurrentProfile();
  if (!profile) redirect(`/login?next=${encodeURIComponent(`/pay/${ref}`)}`);
  const db = createAdminClient();
  if (!db) notFound();
  const { data: sub } = await db.from("submissions").select("id, ref, status, payment_status, amount_cents, property_address, client_name, company_id, inspector_id").eq("ref", ref).maybeSingle();
  if (!sub || !canSeeJob(profile, sub)) {
    // Whoever did a follow-up (e.g. a House & Home re-inspector) can also pay its fee.
    if (!sub || !(searchParams && searchParams.round)) notFound();
  }
  // ?round=<id>: the re-inspection fee for a follow-up.
  let round = null;
  if (searchParams && searchParams.round) {
    const { data } = await db.from("correction_rounds").select("id, fee_cents, fee_status, assigned_to, followup_submitted_by").eq("id", String(searchParams.round)).eq("submission_id", sub.id).maybeSingle();
    if (!data) notFound();
    if (!canSeeJob(profile, sub) && ![data.assigned_to, data.followup_submitted_by].includes(profile.id)) notFound();
    round = data;
  }
  return (
    <>
      <AppHeader title="Pay for a job" profile={profile} />
      <div className="shell" style={{ maxWidth: 560 }}>
        <PayClient job={round
          ? { ref: sub.ref, address: sub.property_address, client: sub.client_name, amount: round.fee_cents, paid: round.fee_status === "paid", status: sub.status, round: round.id }
          : { ref: sub.ref, address: sub.property_address, client: sub.client_name, amount: sub.amount_cents, paid: sub.payment_status === "paid", status: sub.status }} />
      </div>
    </>
  );
}
