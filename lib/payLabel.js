// How a job's payment reads everywhere (job page, company jobs, reports, statements).
export const PAY_LABEL = { paid: "Paid", processing: "Processing", failed: "Failed", unpaid: "Not charged", waived: "No charge", refunded: "Refunded" };
const money = (c) => `$${((c || 0) / 100).toFixed(2).replace(/\.00$/, "")}`;

export function payLabel(job) {
  if (!job) return "";
  const r = job.refunded_cents || 0;
  if (job.payment_status === "refunded" || (r > 0 && r >= (job.amount_cents || 0))) return "Refunded";
  if (r > 0) return `Paid · ${money(r)} refunded`;
  return PAY_LABEL[job.payment_status] || job.payment_status || "";
}

// Money actually kept for a job (paid, less refunds).
export const netPaid = (job) => (["paid", "refunded"].includes(job.payment_status) ? Math.max(0, (job.amount_cents || 0) - (job.refunded_cents || 0)) : 0);
