import { ENGINEER } from "./letterContent";

export const ENGINEER_COLS = "id, full_name, email, role, active, created_at, pe_title, pe_license_number, pe_license_state, pe_license_expires, stamp_drive_file_id, signature_drive_file_id, pe_expiry_warned_days";

// What a letter needs about the certifying engineer.
export function letterEngineer(p) {
  if (!p) return { id: null, name: ENGINEER.name, title: ENGINEER.title, license: "", state: "", expires: null, stampFileId: null, signatureFileId: null };
  return {
    id: p.id, name: p.full_name || ENGINEER.name, title: p.pe_title || ENGINEER.title,
    license: p.pe_license_number || "", state: p.pe_license_state || "", expires: p.pe_license_expires || null,
    stampFileId: p.stamp_drive_file_id || null, signatureFileId: p.signature_drive_file_id || null,
  };
}

export async function listEngineers(db) {
  const { data, error } = await db.from("profiles").select(ENGINEER_COLS).eq("role", "engineer").eq("active", true).order("created_at");
  if (error) return []; // migration 0010 not run yet
  return data || [];
}

// The engineer a job's letter should carry: whoever is reviewing it (if an engineer),
// else the first active engineer (the main one), else the built-in default.
export async function engineerForJob(db, job) {
  if (!db) return letterEngineer(null);
  const ids = [job && job.letter_engineer_id, job && job.reviewed_by].filter(Boolean);
  for (const id of ids) {
    const { data, error } = await db.from("profiles").select(ENGINEER_COLS).eq("id", id).maybeSingle();
    if (!error && data && data.role === "engineer" && data.active) return letterEngineer(data);
  }
  const all = await listEngineers(db);
  return letterEngineer(all[0] || null);
}

export function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "America/Phoenix" }) + "T00:00:00Z");
  return Math.round((new Date(dateStr + "T00:00:00Z") - today) / 86400000);
}

// Problems an admin should hear about (missing details, license expiring/expired).
export function engineerIssues(p) {
  const out = [];
  const name = p.full_name || p.email;
  if (!p.pe_license_number || !p.pe_license_expires) out.push(`${name}: PE license number or expiration date missing.`);
  if (!p.stamp_drive_file_id) out.push(`${name}: no PE stamp uploaded.`);
  const d = daysUntil(p.pe_license_expires);
  if (d != null && d < 0) out.push(`${name}: PE license expired ${-d} day${d === -1 ? "" : "s"} ago.`);
  else if (d != null && d <= 60) out.push(`${name}: PE license expires in ${d} day${d === 1 ? "" : "s"}.`);
  return out;
}

export const longDay = (d) => (d ? new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "");
