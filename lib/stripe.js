import crypto from "node:crypto";

// Minimal Stripe REST client (no SDK needed). Server-only.
const API = "https://api.stripe.com/v1";
const VERSION = "2024-06-20";

export const stripeEnabled = () => Boolean(process.env.STRIPE_SECRET_KEY);
export const stripeTestMode = () => String(process.env.STRIPE_SECRET_KEY || "").startsWith("sk_test_");

// Stripe wants form encoding with bracketed keys: a[b][0]=x
function encode(obj, prefix, out = []) {
  for (const [k, v] of Object.entries(obj || {})) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((item, i) => (typeof item === "object" ? encode(item, `${key}[${i}]`, out) : out.push([`${key}[${i}]`, String(item)])));
    else if (typeof v === "object") encode(v, key, out);
    else out.push([key, String(v)]);
  }
  return out;
}

export async function stripe(method, path, params, { idempotencyKey } = {}) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe isn't configured (STRIPE_SECRET_KEY missing).");
  const headers = { Authorization: `Bearer ${key}`, "Stripe-Version": VERSION };
  let url = API + path, body;
  const pairs = encode(params);
  if (method === "GET") { if (pairs.length) url += "?" + new URLSearchParams(pairs).toString(); }
  else { headers["Content-Type"] = "application/x-www-form-urlencoded"; body = new URLSearchParams(pairs).toString(); }
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  const res = await fetch(url, { method, headers, body, cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error((json.error && json.error.message) || `Stripe error ${res.status}`);
    e.stripe = json.error || {}; e.status = res.status;
    throw e;
  }
  return json;
}

// Verify a webhook's Stripe-Signature header (t=...,v1=...) against the raw body.
export function verifyWebhook(rawBody, header, secret, toleranceSec = 300) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=")).filter((p) => p.length === 2).map(([k, v]) => [k, v]));
  const sigs = header.split(",").filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  const t = Number(parts.t);
  if (!t || !sigs.length) return false;
  if (Math.abs(Date.now() / 1000 - t) > toleranceSec) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${t}.${rawBody}`, "utf8").digest("hex");
  return sigs.some((s) => s.length === expected.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
}

// Human label for a saved payment method, e.g. "Chase checking ••6789" or "Visa ••4242".
export function describePaymentMethod(pm) {
  if (!pm) return null;
  if (pm.type === "us_bank_account" && pm.us_bank_account) {
    const b = pm.us_bank_account;
    return `${b.bank_name || "Bank"} ${b.account_type || "account"} ••${b.last4}`;
  }
  if (pm.type === "card" && pm.card) {
    const brand = pm.card.brand ? pm.card.brand[0].toUpperCase() + pm.card.brand.slice(1) : "Card";
    return `${brand} ••${pm.card.last4} (exp ${pm.card.exp_month}/${String(pm.card.exp_year).slice(-2)})`;
  }
  return pm.type;
}

// Make sure the company has a Stripe customer; returns the customer id.
export async function ensureCustomer(db, company) {
  if (company.stripe_customer_id) return company.stripe_customer_id;
  const c = await stripe("POST", "/customers", {
    name: company.name, email: company.email || undefined, phone: company.phone || undefined,
    metadata: { company_id: company.id },
  }, { idempotencyKey: `customer-${company.id}` });
  await db.from("companies").update({ stripe_customer_id: c.id }).eq("id", company.id);
  return c.id;
}
