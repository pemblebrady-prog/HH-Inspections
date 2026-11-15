import { redirect } from "next/navigation";

// The old Drive-based Companies page was replaced by /admin/companies.
export default function OldCompanies() {
  redirect("/admin/companies");
}
