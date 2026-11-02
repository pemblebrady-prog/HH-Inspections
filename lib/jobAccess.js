// Who can see a job: admins any; company owners their company's; inspectors their own.
export function canSeeJob(profile, job) {
  if (!profile || !job) return false;
  if (profile.role === "admin") return true;
  if (profile.role === "company_owner") return Boolean(job.company_id && job.company_id === profile.company_id);
  return job.inspector_id === profile.id;
}
