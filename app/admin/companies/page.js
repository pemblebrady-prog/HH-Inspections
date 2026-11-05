import { getCurrentProfile } from "../../../lib/supabase/server";
import AdminHeader from "../../AdminHeader";
import CompaniesAdmin from "./CompaniesAdmin";

export const dynamic = "force-dynamic";

export default async function CompaniesPage() {
  const profile = await getCurrentProfile();
  return (
    <>
      <AdminHeader title="Companies" profile={profile} />
      <div className="shell" style={{ maxWidth: 1080 }}><CompaniesAdmin /></div>
    </>
  );
}
