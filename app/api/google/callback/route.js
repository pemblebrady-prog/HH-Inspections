import { getOAuthClientForSetup } from "../../../../lib/drive";
import { google } from "googleapis";

export const runtime = "nodejs";

function page(body) {
  return new Response(
    `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
     <title>Drive setup</title>
     <style>body{font:16px/1.6 system-ui;max-width:680px;margin:40px auto;padding:0 20px;color:#132430;background:#E7E0D0}
     code,pre{font-family:ui-monospace,monospace}
     pre{background:#132430;color:#9FD4E8;padding:14px 16px;border-radius:8px;overflow:auto;white-space:pre-wrap;word-break:break-all}
     .k{color:#A2382A;font-weight:700}h1{font-family:Archivo,system-ui}</style>${body}`,
    { headers: { "content-type": "text/html; charset=utf-8" } }
  );
}

export async function GET(req) {
  const code = new URL(req.url).searchParams.get("code");
  const client = getOAuthClientForSetup();
  if (!client) return page("<h1>Missing client credentials</h1><p>Set the OAuth client id/secret first.</p>");
  if (!code) return page("<h1>No code returned</h1><p>Start again at <code>/api/google/auth</code>.</p>");

  try {
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    if (!tokens.refresh_token) {
      return page(`<h1>No refresh token returned</h1>
        <p>Google only returns it on first consent. Revoke this app's access at
        <a href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a>,
        then visit <code>/api/google/auth</code> again.</p>`);
    }

    // Create the root folder this app will own (works with the drive.file scope).
    const drive = google.drive({ version: "v3", auth: client });
    const folder = await drive.files.create({
      requestBody: { name: "House & Home Submissions", mimeType: "application/vnd.google-apps.folder" },
      fields: "id, webViewLink",
    });

    return page(`<h1>✓ Authorized</h1>
      <p>Add these two to your <code>.env.local</code> (and later to Vercel), then restart the dev server:</p>
      <p class=k>GOOGLE_OAUTH_REFRESH_TOKEN</p>
      <pre>${tokens.refresh_token}</pre>
      <p class=k>GDRIVE_ROOT_FOLDER_ID</p>
      <pre>${folder.data.id}</pre>
      <p>Your submissions folder: <a href="${folder.data.webViewLink}" target=_blank>open in Drive</a>.</p>
      <p style="color:#5c6b74">Treat the refresh token like a password. Once it's set, you can delete the
      <code>/api/google/auth</code> and <code>/api/google/callback</code> routes if you like — they're only for setup.</p>`);
  } catch (err) {
    return page(`<h1>Token exchange failed</h1><pre>${(err && err.message) || err}</pre>
      <p>Check that the redirect URI in your OAuth client exactly matches
      <code>${process.env.GOOGLE_OAUTH_REDIRECT_URI || "http://localhost:3000/api/google/callback"}</code>.</p>`);
  }
}
