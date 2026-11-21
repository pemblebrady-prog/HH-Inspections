import { getDrive, uploadPhoto } from "./drive";
import { PHOTO_SLOTS } from "./formConfig";
import { sendEmail } from "./email";
import { isStaff } from "./roles";
import { canSeeJob } from "./jobAccess";

// Add to a job after it's submitted (Brian, Nov 20: a job came in without its sketch).
// Inspectors (and their company's managers) can add or replace photos and the sketch until the job is
// certified; House & Home staff can any time. Files go into the job's Drive folder and onto
// submissions.photos, so they show on the job page and the regenerated letter uses them.

export const SLOTS = [{ id: "sketch", n: "00", label: "Home Sketch" }, ...PHOTO_SLOTS];
export const OPEN_FOR_INSPECTORS = ["on_hold", "submitted", "under_review", "corrections"];
const MAX_FILES = 120;

export function canAddToJob(profile, sub) {
  if (!profile || !sub || sub.status === "canceled") return false;
  if (isStaff(profile)) return true;
  return canSeeJob(profile, sub) && OPEN_FOR_INSPECTORS.includes(sub.status);
}

const photoList = (sub) => (Array.isArray(sub.photos) ? sub.photos : []);

// Upload one file into the job's folder and record it. replace: drop the slot's existing files from the
// job first (they stay in Drive). Returns { photo, photos }.
export async function addJobFile(db, sub, { slot, name, type, buffer, replace, by, sketchData }) {
  const s = SLOTS.find((x) => x.id === slot);
  if (!s) throw new Error("Pick where this photo goes.");
  const current = photoList(sub);
  if (current.length >= MAX_FILES) throw new Error("This job already has the most photos it can hold.");
  const count = current.filter((p) => p.slot === slot).length;
  const filename = slot === "sketch" ? `Home Sketch (added ${new Date().toLocaleDateString("en-CA", { timeZone: "America/Phoenix" })}).${/png/.test(type) ? "png" : "jpg"}`
    : `${s.n} ${s.label} - ${count + 1} (added).jpg`;
  const drive = await getDrive();
  let id;
  if (drive && sub.drive_folder_id) id = (await uploadPhoto(drive, sub.drive_folder_id, filename.replace(/[\\/:*?"<>|]/g, "-"), type || "image/jpeg", buffer)).id;
  else id = `sim-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; // Drive not connected (preview)
  const photo = { id, label: s.label, slot, added_at: new Date().toISOString(), added_by: by || null, name: name || filename };

  // Re-read just before writing, so two quick uploads don't drop each other.
  const { data: fresh } = await db.from("submissions").select("photos, report").eq("id", sub.id).single();
  let photos = photoList(fresh || sub);
  if (replace) photos = photos.filter((p) => p.slot !== slot);
  photos = [...photos, photo];
  const patch = { photos, photo_count: photos.length };
  if (slot === "sketch" && sketchData) patch.report = { ...((fresh && fresh.report) || sub.report || {}), sketchData };
  if (slot === "sketch" && !sketchData && replace && fresh && fresh.report && fresh.report.sketchData) {
    const { sketchData: _old, ...rest } = fresh.report; patch.report = rest; // an uploaded drawing replaces the in-app one
  }
  const { error } = await db.from("submissions").update(patch).eq("id", sub.id);
  if (error) throw error;
  return { photo, photos };
}

// Take a photo off the job (the file stays in the Drive folder).
export async function removeJobFile(db, sub, id) {
  const { data: fresh } = await db.from("submissions").select("photos").eq("id", sub.id).single();
  const before = photoList(fresh || sub);
  const photos = before.filter((p) => p.id !== id);
  if (photos.length === before.length) throw new Error("That photo isn't on this job.");
  const { error } = await db.from("submissions").update({ photos, photo_count: photos.length }).eq("id", sub.id);
  if (error) throw error;
  return { photos };
}

// After an inspector adds files: tell House & Home staff once (not for staff's own changes).
export async function alertFilesAdded(db, sub, { by, added, removed, origin }) {
  let to = (process.env.REVIEW_ALERT_EMAILS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!to.length) {
    let r = await db.from("profiles").select("email").in("role", ["admin", "office_manager", "engineer"]).eq("active", true);
    if (r.error) r = await db.from("profiles").select("email").in("role", ["admin", "engineer"]).eq("active", true);
    to = (r.data || []).map((p) => p.email).filter(Boolean);
  }
  const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `<div style="font-family:Arial,sans-serif;color:#132430;max-width:520px">
    <p><b>${esc(by || "The inspector")}</b> changed the photos on job <b>${esc(sub.ref)}</b>${sub.property_address ? ` (${esc(sub.property_address)})` : ""}: ${added ? `${added} added` : ""}${added && removed ? ", " : ""}${removed ? `${removed} removed` : ""}.</p>
    ${sub.letter_link ? "<p>The draft letter was made before this. Tap Regenerate letter on the job page to include them.</p>" : ""}
    <p><a href="${origin || ""}/admin/review/${encodeURIComponent(sub.ref)}" style="display:inline-block;background:#0E3A52;color:#fff;padding:10px 18px;border-radius:4px;text-decoration:none">Open the job</a></p></div>`;
  await Promise.all(to.map((addr) => sendEmail({ to: addr, subject: `Photos changed on ${sub.ref}: ${sub.property_address || ""}`, html }).catch(() => {})));
}
