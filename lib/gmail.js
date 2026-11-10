// Send portal email through a connected Gmail account (Gmail API, "send only" permission).
// The connection (refresh token + address) lives in app_secrets, set from Admin → Email.
import crypto from "node:crypto";
import { google } from "googleapis";
import { createAdminClient } from "./supabase/server";

export const GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.send", "openid", "email"];
const KEY = "gmail_sender";
let cache = { at: 0, value: undefined };

export function gmailOAuth(redirectUri) {
  const id = process.env.GOOGLE_OAUTH_CLIENT_ID, secret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!id || !secret) return null;
  return new google.auth.OAuth2(id, secret, redirectUri);
}

// { email, refreshToken, connectedAt } or null
export async function getGmailSender({ fresh = false } = {}) {
  if (!fresh && cache.value !== undefined && Date.now() - cache.at < 60000) return cache.value;
  let v = null;
  const db = createAdminClient();
  if (db) {
    const { data, error } = await db.from("app_secrets").select("value").eq("key", KEY).maybeSingle();
    if (!error && data && data.value && data.value.refreshToken) v = data.value;
  }
  cache = { at: Date.now(), value: v };
  return v;
}

export async function saveGmailSender(value, byId) {
  const db = createAdminClient();
  const { error } = await db.from("app_secrets").upsert({ key: KEY, value, updated_at: new Date().toISOString(), updated_by: byId || null });
  if (error) throw new Error(/app_secrets/.test(error.message) ? "Run database update 0014 in Supabase first." : error.message);
  cache = { at: 0, value: undefined };
}

export async function disconnectGmail() {
  const db = createAdminClient();
  const cur = await getGmailSender({ fresh: true });
  if (cur && cur.refreshToken) { try { await gmailOAuth().revokeToken(cur.refreshToken); } catch { /* already gone */ } }
  await db.from("app_secrets").delete().eq("key", KEY);
  cache = { at: 0, value: undefined };
}

// ---- Building the email (MIME) ----
const b64 = (s) => Buffer.from(s).toString("base64");
const wrap = (s) => s.replace(/.{1,76}/g, "$&\r\n");
const encWord = (s) => (/^[\x20-\x7E]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);
const clean = (s) => String(s || "").replace(/[\r\n]+/g, " ").trim(); // no header injection
const list = (v) => (Array.isArray(v) ? v : [v]).map(clean).filter(Boolean);
const MIME = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", csv: "text/csv", txt: "text/plain" };

export function buildMime({ from, to, subject, html, attachments = [], replyTo }) {
  const boundary = "hh_" + crypto.randomBytes(12).toString("hex");
  const lines = [
    `From: ${clean(from)}`, `To: ${list(to).join(", ")}`, `Subject: ${encWord(clean(subject))}`,
    ...(replyTo ? [`Reply-To: ${list(replyTo).join(", ")}`] : []),
    "MIME-Version: 1.0", `Content-Type: multipart/mixed; boundary="${boundary}"`, "",
    `--${boundary}`, "Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: base64", "", wrap(b64(html || "")),
  ];
  for (const a of attachments) {
    const name = clean(a.filename || "attachment").replace(/"/g, "");
    const type = MIME[(name.split(".").pop() || "").toLowerCase()] || "application/octet-stream";
    const body = Buffer.isBuffer(a.content) ? a.content.toString("base64") : Buffer.from(a.content || "").toString("base64");
    lines.push(`--${boundary}`, `Content-Type: ${type}; name="${encWord(name)}"`, "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${encWord(name)}"`, "", wrap(body));
  }
  lines.push(`--${boundary}--`, "");
  return lines.join("\r\n");
}

export async function sendViaGmail(sender, { to, subject, html, attachments, replyTo }) {
  const auth = gmailOAuth();
  auth.setCredentials({ refresh_token: sender.refreshToken });
  const gmail = google.gmail({ version: "v1", auth });
  const name = process.env.EMAIL_FROM_NAME || "House & Home Inspections";
  const mime = buildMime({ from: `${name} <${sender.email}>`, to, subject, html, attachments, replyTo });
  const r = await gmail.users.messages.send({ userId: "me", requestBody: { raw: Buffer.from(mime).toString("base64url") } });
  return { id: r.data && r.data.id, via: "gmail" };
}
