import { NextResponse } from "next/server";
import { requireUser } from "../../../../../lib/supabase/server";
import { gmailOAuth, saveGmailSender, GMAIL_SCOPES } from "../../../../../lib/gmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Google sends the admin back here after approving. Keep the connection privately on the server.
export async function GET(req) {
  const url = new URL(req.url);
  const back = (q) => {
    const res = NextResponse.redirect(`${url.origin}/admin/email?${q}`);
    res.cookies.set("hh_gmail_state", "", { path: "/", maxAge: 0 });
    return res;
  };
  const auth = await requireUser(["admin"]);
  if (auth.error) return auth.error;
  if (url.searchParams.get("error")) return back(`error=${encodeURIComponent("Google sign-in was canceled.")}`);
  if (!url.searchParams.get("state") || url.searchParams.get("state") !== req.cookies.get("hh_gmail_state")?.value) {
    return back(`error=${encodeURIComponent("That sign-in link expired. Try Connect Gmail again.")}`);
  }
  try {
    const oauth = gmailOAuth(`${url.origin}/api/google/gmail/callback`);
    const { tokens } = await oauth.getToken(url.searchParams.get("code"));
    if (!tokens.refresh_token) return back(`error=${encodeURIComponent("Google didn't grant lasting access. Remove the portal under myaccount.google.com → Security → Third-party access, then connect again.")}`);
    if (!String(tokens.scope || "").includes(GMAIL_SCOPES[0])) return back(`error=${encodeURIComponent("Please tick the box allowing the portal to send email, then try again.")}`);
    const ticket = await oauth.verifyIdToken({ idToken: tokens.id_token, audience: process.env.GOOGLE_OAUTH_CLIENT_ID });
    const email = ticket.getPayload().email;
    await saveGmailSender({ email, refreshToken: tokens.refresh_token, connectedAt: new Date().toISOString() }, auth.profile && auth.profile.id);
    return back(`connected=${encodeURIComponent(email)}`);
  } catch (e) {
    return back(`error=${encodeURIComponent(e.message || "Couldn't connect Gmail.")}`);
  }
}
