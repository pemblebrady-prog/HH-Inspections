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
        <BillingClient />
      </div>
    </>
  );
}
