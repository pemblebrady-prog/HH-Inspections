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

// Create/find a nested folder path under root, returning the deepest folder id.
// e.g. ["July 2025", "Jane Inspector", "John Client"]
export async function ensureFolderPath(drive, rootId, segments) {
  let parent = rootId;
  for (const seg of segments) {
    parent = await findOrCreateFolder(drive, seg || "Unknown", parent);
  }
  return parent;
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

const INDEX_NAME = "submissions-index.json";

// Read the central tracking index (one file in the app root). Returns {id, records}.
export async function readSubmissions(drive, rootId) {
  const list = await drive.files.list({
    q: `name = '${INDEX_NAME}' and '${q(rootId)}' in parents and trashed = false`,
    fields: "files(id)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    spaces: "drive",
  });
  if (!list.data.files || !list.data.files.length) return { id: null, records: [] };
  const id = list.data.files[0].id;
  try {
    const res = await drive.files.get(
      { fileId: id, alt: "media", supportsAllDrives: true },
      { responseType: "text" }
    );
    const parsed = JSON.parse(res.data || "[]");
    return { id, records: Array.isArray(parsed) ? parsed : [] };
  } catch {
    return { id, records: [] };
  }
}

// Append one submission record to the central index (read-modify-write).
export async function appendSubmission(drive, rootId, record) {
  const { id, records } = await readSubmissions(drive, rootId);
  records.push(record);
  const media = {
    mimeType: "application/json",
    body: Readable.from(Buffer.from(JSON.stringify(records, null, 2), "utf8")),
  };
  if (id) {
    await drive.files.update({ fileId: id, media, supportsAllDrives: true });
  } else {
    await drive.files.create({
      requestBody: { name: INDEX_NAME, parents: [rootId] },
      media,
      fields: "id",
      supportsAllDrives: true,
    });
  }
  return records.length;
}
