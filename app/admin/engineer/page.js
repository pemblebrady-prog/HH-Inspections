import { getCurrentProfile } from "../../../lib/supabase/server";
import AdminHeader from "../../AdminHeader";
import EngineerDetails from "./EngineerDetails";

export const dynamic = "force-dynamic";

// /admin/engineer — your PE details (engineers); admins add ?id=<person> for anyone.
export default async function EngineerPage({ searchParams }) {
  const profile = await getCurrentProfile();
  const id = profile && profile.role === "admin" ? (searchParams && searchParams.id) || "" : "";
  return (
    <>
      <AdminHeader title="Engineer details" profile={profile} />
      <div className="shell" style={{ maxWidth: 760 }}><EngineerDetails id={id} /></div>
    </>
  );
}
