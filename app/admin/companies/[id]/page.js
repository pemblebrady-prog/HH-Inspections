import { getCurrentProfile } from "../../../../lib/supabase/server";
import AdminHeader from "../../../AdminHeader";
import CompanyAdmin from "./CompanyAdmin";

export const dynamic = "force-dynamic";

export default async function CompanyPage({ params }) {
  const profile = await getCurrentProfile();
  return (
    <>
      <AdminHeader title="Company" profile={profile} />
      <div className="shell" style={{ maxWidth: 1080 }}><CompanyAdmin id={params.id} /></div>
    </>
  );
}
