import { google } from "googleapis";
import { NextResponse } from "next/server";
import { requireUser } from "../../../../../lib/supabase/server";
import { driveOAuth, saveDriveOwner, DRIVE_SCOPES } from "../../../../../lib/drive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FOLDER = "House & Home Portal";

// Back from Google: keep the Drive connection privately and make the portal's own main folder.
// (The portal's Drive permission only reaches files it creates, so it makes this folder itself.)
export async function GET(req) {
  const url = new URL(req.url);
  const back = (q) => {
    const res = NextResponse.redirect(`${url.origin}/admin/email?${q}`);
    res.cookies.set("hh_drive_state", "", { path: "/", maxAge: 0 });
    return res;
  };
  const auth = await requireUser(["admin"]);
  if (auth.error) return auth.error;
  if (url.searchParams.get("error")) return back(`error=${encodeURIComponent("Google sign-in was canceled.")}`);
  if (!url.searchParams.get("state") || url.searchParams.get("state") !== req.cookies.get("hh_drive_state")?.value) {
    return back(`error=${encodeURIComponent("That sign-in link expired. Try Connect Google Drive again.")}`);
  }
  try {
    const oauth = driveOAuth(`${url.origin}/api/google/drive/callback`);
    const { tokens } = await oauth.getToken(url.searchParams.get("code"));
    if (!tokens.refresh_token) return back(`error=${encodeURIComponent("Google didn't grant lasting access. Remove the portal under myaccount.google.com → Security → Third-party access, then connect again.")}`);
    if (!String(tokens.scope || "").includes(DRIVE_SCOPES[0])) return back(`error=${encodeURIComponent("Please allow access to Google Drive files, then try again.")}`);
    const ticket = await oauth.verifyIdToken({ idToken: tokens.id_token, audience: process.env.GOOGLE_OAUTH_CLIENT_ID });
    const email = ticket.getPayload().email;

    // Find (on reconnect) or create the portal's main folder in their My Drive.
    oauth.setCredentials(tokens);
    const drive = google.drive({ version: "v3", auth: oauth });
    const found = await drive.files.list({ q: `name = '${FOLDER}' and mimeType = 'application/vnd.google-apps.folder' and 'root' in parents and trashed = false`, fields: "files(id)", pageSize: 1 });
    const rootFolderId = (found.data.files && found.data.files[0] && found.data.files[0].id)
      || (await drive.files.create({ requestBody: { name: FOLDER, mimeType: "application/vnd.google-apps.folder" }, fields: "id" })).data.id;

    await saveDriveOwner({ email, refreshToken: tokens.refresh_token, rootFolderId, connectedAt: new Date().toISOString() }, auth.profile && auth.profile.id);
    return back(`drive=${encodeURIComponent(email)}`);
  } catch (e) {
    return back(`error=${encodeURIComponent(e.message || "Couldn't connect Google Drive.")}`);
  }
}
