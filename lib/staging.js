// Background uploads: photos go to a private per-person holding folder in Drive
// while the form is still being filled in, then get moved into the job's folder on submit.
import { findOrCreateFolder, rootFolderId, uploadPhoto } from "./drive";

const STAGING = "Uploads in progress";
const q = (v) => String(v).replace(/\\/g, "\\\\").replace(/'/g, "\\'");

export async function stagingFolder(drive, userId) {
  const top = await findOrCreateFolder(drive, STAGING, rootFolderId());
  return findOrCreateFolder(drive, String(userId), top);
}

// Upload one photo to the holding folder (named by its id on the phone, so retries don't duplicate).
export async function stagePhoto(drive, userId, photoId, mimeType, buffer) {
  const folder = await stagingFolder(drive, userId);
  const name = `${photoId}.jpg`;
  const found = await drive.files.list({
    q: `name = '${q(name)}' and '${q(folder)}' in parents and trashed = false`,
    fields: "files(id)", supportsAllDrives: true, includeItemsFromAllDrives: true, pageSize: 1,
  });
  if (found.data.files && found.data.files.length) return found.data.files[0].id;
  return (await uploadPhoto(drive, folder, name, mimeType, buffer)).id;
}

// Is this file in this person's holding folder? (So nobody can move someone else's files.)
export async function isStagedBy(drive, userId, fileId) {
  const folder = await stagingFolder(drive, userId);
  try {
    const f = await drive.files.get({ fileId, fields: "id, parents, trashed", supportsAllDrives: true });
    return Boolean(f.data && !f.data.trashed && (f.data.parents || []).includes(folder)) ? folder : null;
  } catch { return null; }
}

// Move a staged photo into the job folder with its final name.
export async function claimStaged(drive, fileId, fromFolder, toFolder, name) {
  const r = await drive.files.update({
    fileId, addParents: toFolder, removeParents: fromFolder, requestBody: { name },
    fields: "id, name", supportsAllDrives: true,
  });
  return r.data;
}

// Daily: delete holding-folder photos nobody submitted (older than `days`).
export async function cleanStaging(drive, days = 14) {
  const top = await findOrCreateFolder(drive, STAGING, rootFolderId());
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  const people = await drive.files.list({ q: `'${q(top)}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`, fields: "files(id)", pageSize: 1000, supportsAllDrives: true, includeItemsFromAllDrives: true });
  let removed = 0;
  for (const p of people.data.files || []) {
    let pageToken;
    do {
      const old = await drive.files.list({ q: `'${q(p.id)}' in parents and trashed = false and modifiedTime < '${cutoff}'`, fields: "nextPageToken, files(id)", pageSize: 200, pageToken, supportsAllDrives: true, includeItemsFromAllDrives: true });
      for (const f of old.data.files || []) { await drive.files.delete({ fileId: f.id, supportsAllDrives: true }).catch(() => {}); removed++; }
      pageToken = old.data.nextPageToken;
    } while (pageToken);
  }
  return removed;
}
