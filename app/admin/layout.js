import { redirect } from "next/navigation";
import { getCurrentProfile } from "../../lib/supabase/server";
import { authEnabled } from "../../lib/supabase/config";

export const dynamic = "force-dynamic";

// Everything under /admin is for House & Home admins only.
export default async function AdminOnly({ children }) {
  if (!authEnabled) redirect("/");
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login?next=/admin/people");
  if (profile.role !== "admin") redirect("/");
  return children;
}
