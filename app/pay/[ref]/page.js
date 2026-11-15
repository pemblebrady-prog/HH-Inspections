import { redirect, notFound } from "next/navigation";
import { getCurrentProfile, createAdminClient } from "../../../lib/supabase/server";
import { canSeeJob } from "../../../lib/jobAccess";
import AppHeader from "../../AppHeader";
import PayClient from "./PayClient";

export const dynamic = "force-dynamic";

// /pay/HH-1015 — pay-as-you-go: pay for one job by card, then it goes to the engineer.
export default async function PayPage({ params }) {
  const ref = decodeURIComponent(params.ref);
  const profile = await getCurrentProfile();
  if (!profile) redirect(`/login?next=${encodeURIComponent(`/pay/${ref}`)}`);
  const db = createAdminClient();
  if (!db) notFound();
  const { data: sub } = await db.from("submissions").select("id, ref, status, payment_status, amount_cents, property_address, client_name, company_id, inspector_id").eq("ref", ref).maybeSingle();
  if (!sub || !canSeeJob(profile, sub)) notFound();
  return (
    <>
      <AppHeader title="Pay for a job" profile={profile} />
      <div className="shell" style={{ maxWidth: 560 }}>
        <PayClient job={{ ref: sub.ref, address: sub.property_address, client: sub.client_name, amount: sub.amount_cents, paid: sub.payment_status === "paid", status: sub.status }} />
      </div>
    </>
  );
}
