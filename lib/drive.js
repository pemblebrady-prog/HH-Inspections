import { google } from "googleapis";
import { Readable } from "node:stream";

// Build an OAuth2 client from env (works on personal Gmail — files owned by you).
// Returns null if the client id/secret aren't set.
function oauthClient() {
  const id = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const secret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirect =
    process.env.GOOGLE_OAUTH_REDIRECT_URI || "http://localhost:3000/api/google/callback";
  if (!id || !secret) return null;
  const c = new google.auth.OAuth2(id, secret, redirect);
  const refresh = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
  if (refresh) c.setCredentials({ refresh_token: refresh });
  return c;
}

// Used by the one-time setup routes (before a refresh token exists).
export function getOAuthClientForSetup() {
  return oauthClient();
}

// Returns a ready Drive client, or null (which triggers "simulated" mode).
// Prefers OAuth (Gmail, now). Falls back to a service account (Workspace /
// Shared Drive, later) — so the same code works in both worlds, no rewrite.
export function getDrive() {
  const oc = oauthClient();
  if (oc && process.env.GOOGLE_OAUTH_REFRESH_TOKEN) {
    return google.drive({ version: "v3", auth: oc });
  }
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let key = process.env.GOOGLE_PRIVATE_KEY;
  if (email && key && process.env.GDRIVE_ROOT_FOLDER_ID) {
    key = key.replace(/\\n/g, "\n");
    const auth = new google.auth.GoogleAuth({
      credentials: { client_email: email, private_key: key },
      scopes: ["https://www.googleapis.com/auth/drive"],
    });
    return google.drive({ version: "v3", auth });
  }
  return null;
}

export function rootFolderId() {
  return process.env.GDRIVE_ROOT_FOLDER_ID;
}

function q(v) {
  return String(v).replace(/'/g, "\\'");
}

export async function findOrCreateFolder(drive, name, parentId) {
  const res = await drive.files.list({
    q: `name = '${q(name)}' and '${q(parentId)}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id, name)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    spaces: "drive",
  });
  if (res.data.files && res.data.files.length) return res.data.files[0].id;
  const created = await drive.files.create({
    requestBody: { name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] },
    fields: "id",
    supportsAllDrives: true,
  });
  return created.data.id;
}

export async function ensureSubmissionFolder(drive, rootId, address, dateStr) {
  const addrFolder = await findOrCreateFolder(drive, address || "Unknown address", rootId);
  return findOrCreateFolder(drive, dateStr, addrFolder);
}

export async function uploadPhoto(drive, folderId, filename, mimeType, buffer) {
  const created = await drive.files.create({
    requestBody: { name: filename, parents: [folderId] },
    media: { mimeType: mimeType || "image/jpeg", body: Readable.from(buffer) },
    fields: "id, name, webViewLink",
    supportsAllDrives: true,
  });
  return created.data;
}

export async function writeMetadata(drive, folderId, obj) {
  const body = Buffer.from(JSON.stringify(obj, null, 2), "utf8");
  const created = await drive.files.create({
    requestBody: { name: "submission.json", parents: [folderId] },
    media: { mimeType: "application/json", body: Readable.from(body) },
    fields: "id",
    supportsAllDrives: true,
  });
  return created.data;
}
