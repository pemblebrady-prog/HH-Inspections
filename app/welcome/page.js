import { redirect } from "next/navigation";
import { getCurrentProfile } from "../../lib/supabase/server";
import { authEnabled } from "../../lib/supabase/config";
import Welcome from "./Welcome";

export const dynamic = "force-dynamic";

// First-sign-in setup. Admins and people already set up go straight to the portal.
export default async function WelcomePage() {
  if (!authEnabled) redirect("/");
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login?next=/welcome");
  if (profile.role === "admin" || profile.onboarded_at) redirect("/");
  return <Welcome profile={profile} />;
}
