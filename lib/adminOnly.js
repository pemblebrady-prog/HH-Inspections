import { redirect } from "next/navigation";
import { getCurrentProfile } from "./supabase/server";
import { authEnabled } from "./supabase/config";

// For admin-only sections under /admin (orders, people, statements, companies).
// Engineers who land here go back to the review queue.
// strict = admins only (Google & email); otherwise office managers come in too.
export async function adminOnly(next, strict) {
  if (!authEnabled) redirect("/");
  const profile = await getCurrentProfile();
  if (!profile) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (profile.role === "engineer") redirect("/admin/review");
  if (strict ? profile.role !== "admin" : !["admin", "office_manager"].includes(profile.role)) redirect(strict ? "/admin/review" : "/");
  return profile;
}
