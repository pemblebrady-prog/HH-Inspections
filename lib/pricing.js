// Prices: one default price for everyone, plus an optional custom price per company.
// companies.price_cents = null → use the default.

const FALLBACK = Math.round(Number(process.env.NEXT_PUBLIC_CERT_FEE || 135) * 100);

export async function getDefaultPriceCents(db) {
  if (!db) return FALLBACK;
  try {
    const { data, error } = await db.from("settings").select("value").eq("key", "default_price_cents").maybeSingle();
    if (error || !data) return FALLBACK; // migration 0008 not run yet
    const n = Number(data.value);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : FALLBACK;
  } catch { return FALLBACK; }
}

export const effectivePriceCents = (company, defaultCents) =>
  company && company.price_cents != null ? company.price_cents : defaultCents;

// Fill in company.price_cents with what this company actually pays (keeps the custom flag).
export async function withEffectivePrice(db, company) {
  if (!company) return company;
  const def = await getDefaultPriceCents(db);
  return { ...company, custom_price_cents: company.price_cents ?? null, price_cents: effectivePriceCents(company, def) };
}

export const dollars = (cents) => `$${(Number(cents || 0) / 100).toFixed(Number(cents) % 100 ? 2 : 0)}`;

// "135" / "$135.50" → cents, or null for blank. Returns NaN for junk.
export function parseDollars(v) {
  const s = String(v == null ? "" : v).replace(/[$,\s]/g, "");
  if (!s) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return NaN;
  return Math.round(Number(s) * 100);
}
