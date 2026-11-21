import { isStaff, isCompanyManager } from "./roles";
// Who can see a job: admins any; company owners their company's; inspectors their own.
export function canSeeJob(profile, job) {
  if (!profile || !job) return false;
  if (isStaff(profile)) return true;
  if (isCompanyManager(profile)) return Boolean(job.company_id && job.company_id === profile.company_id);
  return job.inspector_id === profile.id;
}
