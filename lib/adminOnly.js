import { redirect } from "next/navigation";
import { getCurrentProfile } from "./supabase/server";
import { authEnabled } from "./supabase/config";

// For admin-only sections under /admin (orders, people, statements, companies).
// Engineers who land here go back to the review queue.
export async function adminOnly(next) {
  if (!authEnabled) redirect("/");
  const profile = await getCurrentProfile();
  if (!profile) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (profile.role === "engineer") redirect("/admin/review");
  if (profile.role !== "admin") redirect("/");
  return profile;
}
