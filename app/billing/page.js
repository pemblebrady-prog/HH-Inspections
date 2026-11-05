import { redirect } from "next/navigation";
import { getCurrentProfile } from "../../lib/supabase/server";
import { authEnabled } from "../../lib/supabase/config";
import BillingClient from "./BillingClient";
import AppHeader from "../AppHeader";

export const dynamic = "force-dynamic";

// Company owners: payment method on file + recent charges.
export default async function BillingPage() {
  if (!authEnabled) redirect("/");
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login?next=/billing");
  if (profile.role !== "company_owner") redirect("/");
  return (
    <>
      <AppHeader title="Billing" profile={profile} />
      <div className="shell" style={{ maxWidth: 900 }}>
        {profile.company && profile.company.pay_per_job && (
          <div className="card" style={{ marginBottom: 18 }}>
            <p style={{ margin: 0 }}><b>Your company pays by card for each job.</b> After a job is submitted, pay for it on the job's pay page (linked in the email and on My jobs). Nothing is charged automatically.</p>
          </div>
        )}
        <BillingClient />
      </div>
    </>
  );
}
