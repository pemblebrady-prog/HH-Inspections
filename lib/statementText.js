// What a charge shows on the payer's card or bank statement, e.g. "H&H AZ* HH-1015".
//
// Cards: Stripe joins the account's shortened descriptor (set once in the Stripe
//   dashboard: Settings > Business > Public details > Shortened descriptor = "H&H AZ")
//   with "* " and the per-charge suffix we send. 22 characters max in total.
// Bank (ACH): no suffix; we send the full text instead ("H&H AZ HH-1015").
export const STATEMENT_PREFIX = (process.env.STRIPE_STATEMENT_PREFIX || "H&H AZ").slice(0, 10);
const MAX = 22;

// Stripe rejects < > \ ' " * and non-Latin characters.
const clean = (s) => String(s || "").normalize("NFKD").replace(/[^\x20-\x7E]/g, "").replace(/[<>\\'"*]/g, "").replace(/\s+/g, " ").trim();

export function statementFields(ref, { ach = false } = {}) {
  const job = clean(ref);
  if (ach) {
    const full = clean(`${STATEMENT_PREFIX} ${job}`).slice(0, MAX);
    return full.length >= 5 && /[a-z]/i.test(full) ? { statement_descriptor: full } : {};
  }
  const room = MAX - STATEMENT_PREFIX.length - 2; // prefix + "* "
  const suffix = job.slice(0, room).trim();
  return suffix && /[a-z]/i.test(suffix) ? { statement_descriptor_suffix: suffix } : {};
}

// The line people will see, for receipts and help text.
export const statementLine = (ref, { ach = false } = {}) => (ach ? clean(`${STATEMENT_PREFIX} ${ref}`).slice(0, MAX) : `${STATEMENT_PREFIX}* ${clean(ref)}`.slice(0, MAX));
