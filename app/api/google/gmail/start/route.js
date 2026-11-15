import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { requireUser } from "../../../../../lib/supabase/server";
import { gmailOAuth, GMAIL_SCOPES } from "../../../../../lib/gmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin → Email → Connect Gmail: send them to Google to approve "send email as you".
export async function GET(req) {
  const auth = await requireUser(["admin"]);
  if (auth.error) return auth.error;
  const origin = new URL(req.url).origin;
  const oauth = gmailOAuth(`${origin}/api/google/gmail/callback`);
  if (!oauth) return NextResponse.redirect(`${origin}/admin/email?error=${encodeURIComponent("Google sign-in isn't set up (GOOGLE_OAUTH_CLIENT_ID / SECRET missing).")}`);
  const state = crypto.randomBytes(16).toString("hex");
  const url = oauth.generateAuthUrl({ access_type: "offline", prompt: "consent select_account", scope: GMAIL_SCOPES, state, include_granted_scopes: false });
  const res = NextResponse.redirect(url);
  res.cookies.set("hh_gmail_state", state, { path: "/", httpOnly: true, sameSite: "lax", secure: true, maxAge: 600 });
  return res;
}
