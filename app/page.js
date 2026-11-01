import { redirect } from "next/navigation";
import PortalPage from "./PortalPage";
import { getCurrentProfile } from "../lib/supabase/server";
import { authEnabled } from "../lib/supabase/config";

export const dynamic = "force-dynamic";

// Server-side gate for the submission form: signed-in users only.
export default async function Page() {
  let profile = null;
  if (authEnabled) {
    profile = await getCurrentProfile();
    if (!profile) redirect("/login");
  }
  return <PortalPage profile={profile} />;
}
