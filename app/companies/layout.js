import { redirect } from "next/navigation";
import { getCurrentProfile } from "../../lib/supabase/server";
import { authEnabled } from "../../lib/supabase/config";
import { isOffice } from "../../lib/roles";

export const dynamic = "force-dynamic";

// Admins only (Brian, Ron, office staff).
export default async function AdminOnly({ children }) {
  if (authEnabled) {
    const profile = await getCurrentProfile();
    if (!profile) redirect("/login?next=/companies");
    if (!isOffice(profile)) redirect("/");
  }
  return children;
}
