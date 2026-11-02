import { redirect } from "next/navigation";
import { getCurrentProfile } from "../../lib/supabase/server";
import { authEnabled } from "../../lib/supabase/config";
import UserMenu from "../UserMenu";
import BillingClient from "./BillingClient";

export const dynamic = "force-dynamic";

// Company owners: payment method on file + recent charges.
export default async function BillingPage() {
  if (!authEnabled) redirect("/");
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login?next=/billing");
  if (profile.role !== "company_owner") redirect("/");
  return (
    <>
      <header><div className="bar">
        <a className="brand" href="/"><b>House&nbsp;<span>&amp;</span>&nbsp;Home</b><span className="sub">Billing</span></a>
        <div className="who"><a className="viewswitch" href="/">Portal</a><UserMenu profile={profile} /></div>
      </div></header>
      <div className="shell" style={{ maxWidth: 900 }}>
        <BillingClient />
      </div>
    </>
  );
}
