import { redirect } from "next/navigation";
import PortalPage from "./PortalPage";
import { getCurrentProfile } from "../lib/supabase/server";
import { authEnabled } from "../lib/supabase/config";
import { isStaff } from "../lib/roles";

export const dynamic = "force-dynamic";

// Server-side gate for the submission form: signed-in users only.
export default async function Page() {
  let profile = null;
  if (authEnabled) {
    profile = await getCurrentProfile();
    if (!profile) redirect("/login");
    // Engineers can submit their own inspections too (Ron inspects as well as certifies).
    // First sign-in: finish setup before submitting (House & Home staff skip this).
    if (!isStaff(profile) && !profile.onboarded_at) redirect("/welcome");
  }
  return <PortalPage profile={profile} />;
}
