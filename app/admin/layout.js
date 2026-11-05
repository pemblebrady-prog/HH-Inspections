import { redirect } from "next/navigation";
import { getCurrentProfile } from "../../lib/supabase/server";
import { authEnabled } from "../../lib/supabase/config";
import { isStaff } from "../../lib/roles";

export const dynamic = "force-dynamic";

// Everything under /admin is House & Home staff only. Admin-only sections
// (orders, people, statements, companies) add their own check for engineers.
export default async function StaffOnly({ children }) {
  if (!authEnabled) redirect("/");
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login?next=/admin/review");
  if (!isStaff(profile)) redirect("/");
  return children;
}
