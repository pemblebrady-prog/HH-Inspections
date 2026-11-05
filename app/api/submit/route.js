import { NextResponse } from "next/server";
import { requireUser, createAdminClient } from "../../../lib/supabase/server";
import { withEffectivePrice, getDefaultPriceCents } from "../../../lib/pricing";
import { getDrive, rootFolderId, findOrCreateFolder, createUniqueFolder, appendSubmission } from "../../../lib/drive";

export const runtime = "nodejs";

function submissionId() {
  return "HH-" + Math.random().toString(36).slice(2, 7).toUpperCase();
}
function monthYearFrom(dateStr) {
  const d = dateStr ? new Date(dateStr + "T00:00:00") : new Date();
  if (isNaN(d)) return "Undated";
  return d.toLocaleString("en-US", { month: "long" }) + " " + d.getFullYear();
}
function mmddyyyy(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr || "");
  return m ? `${m[2]}-${m[3]}-${m[1]}` : "undated";
}
const CARD_FIELDS = ["cardname", "cardnum", "exp", "cvc"];

// Save the submission in the database. Best-effort for now (Drive is still the
// main record until the data move); returns the database ref (HH-1001...) or null.
async function recordInDatabase({ profile, data, date, isDemo, folderId, driveLink, photoCount, clientId }) {
  const db = createAdminClient();
  if (!db) return null;
  try {
    const report = Object.fromEntries(Object.entries(data).filter(([k]) => !CARD_FIELDS.includes(k) && !["demo", "photoCount", "clientId"].includes(k)));
    // Company: the signed-in user's company, else the one picked on the form.
    let company = profile && profile.company ? profile.company : null;
    if (!company && data.inspectionCompany) {
      const { data: c } = await db.from("companies").select("id, name, is_internal, price_cents").eq("name", data.inspectionCompany).maybeSingle();
      company = c ? await withEffectivePrice(db, c) : null;
    }
    const internal = company ? company.is_internal : false;
    const amount = company ? company.price_cents : await getDefaultPriceCents(db);
    const orderId = typeof data.orderId === "string" && /^[0-9a-f-]{36}$/i.test(data.orderId) ? data.orderId : null;
    const insertRow = {
      company_id: company ? company.id : null,
      inspector_id: profile ? profile.id : null,
      status: "submitted",
      is_demo: isDemo,
      inspection_date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
      property_address: (data.propertyAddress || "").trim(),
      client_name: (data.clientName || "").trim(),
      inspector_name: (data.inspectorName || "").trim(),
      inspection_type: data.inspectionType || null,
      send_report_to: (data.sendReportTo || "").trim(),
      report,
      photo_count: photoCount || 0,
      drive_folder_id: folderId || null,
      drive_link: driveLink || null,
      amount_cents: isDemo ? 0 : amount,
      payment_status: isDemo || internal ? "waived" : "unpaid", // charged in /api/submit/finalize once photos arrive
    };
    let { data: row, error } = await db.from("submissions")
      .insert({ ...insertRow, status: "uploading", client_id: clientId || null, ...(orderId ? { order_id: orderId } : {}) })
      .select("id, ref, amount_cents, company_id, property_address").single();
    if (error && /client_id|uploading|enum|order_id/i.test(error.message || "")) {
      // Migration 0006 not run yet: fall back to the older shape.
      ({ data: row, error } = await db.from("submissions").insert(insertRow).select("id, ref, amount_cents, company_id, property_address").single());
    }
    if (error) throw error;

    // Came from an order: link them (admins, or the inspector it's assigned to).
    if (orderId && !isDemo) {
      try {
        const { data: o } = await db.from("orders").select("id, inspector_id").eq("id", orderId).maybeSingle();
        if (o && (!profile || profile.role === "admin" || !o.inspector_id || o.inspector_id === profile.id)) {
          await db.from("orders").update({ submission_id: row.id, status: "inspected" }).eq("id", o.id);
        }
      } catch (e) { console.error("order link failed", e.message); }
    }
    return row.ref;
  } catch (err) {
    console.error("database insert failed", err);
    return null;
  }
}

function clean(s) {
  return (s || "").trim().replace(/[\\/:*?"<>|]/g, "-") || "Unknown";
}

export async function POST(req) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  let data;
  try { data = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 }); }

  const isDemo = data.demo === true;
  const clientId = typeof data.clientId === "string" && /^[\w-]{8,64}$/.test(data.clientId) ? data.clientId : null;

  // A retry from the same phone: hand back the submission we already made.
  const dbx = createAdminClient();
  if (dbx && clientId) {
    const { data: existing } = await dbx.from("submissions").select("ref, drive_folder_id, drive_link, is_demo, inspector_id").eq("client_id", clientId).maybeSingle();
    if (existing && (!auth.profile || existing.inspector_id === auth.profile.id)) return NextResponse.json({ ok: true, submissionId: existing.ref, folderId: existing.drive_folder_id, driveLink: existing.drive_link, demo: existing.is_demo, existing: true });
  }

  let id = submissionId();
  const submittedAt = new Date().toISOString();
  const date = (data.date || new Date().toISOString().slice(0, 10)).trim();
  const monthYear = monthYearFrom(date);
  const inspector = clean(data.inspectorName);
  const clientBase = `${clean(data.clientName)} - ${mmddyyyy(date)}`;
  const co = auth.profile && auth.profile.company;
  const amountPaid = (co && co.price_cents != null ? co.price_cents : await getDefaultPriceCents(dbx)) / 100; // old Drive tracker column

  const drive = getDrive();
  if (!drive) {
    const ref = await recordInDatabase({ profile: auth.profile, data, date, isDemo, photoCount: data.photoCount, clientId });
    if (ref) id = ref;
    return NextResponse.json({ ok: true, simulated: true, submissionId: id, path: `${monthYear} / ${inspector} / ${clientBase}` });
  }

  try {
    // Month / Inspector reuse existing folders; the client folder is always unique per submission.
    const root = rootFolderId();
    // Demo submissions live under their own folder and never touch the submissions log.
    const base = isDemo ? await findOrCreateFolder(drive, "_Demo Submissions", root) : root;
    const monthId = await findOrCreateFolder(drive, monthYear, base);
    const inspectorId = await findOrCreateFolder(drive, inspector, monthId);
    const { id: folderId, name: clientFolderName } = await createUniqueFolder(drive, clientBase, inspectorId);
    const driveLink = `https://drive.google.com/drive/folders/${folderId}`;
    const path = `${isDemo ? "_Demo Submissions / " : ""}${monthYear} / ${inspector} / ${clientFolderName}`;

    const ref = await recordInDatabase({ profile: auth.profile, data, date, isDemo, folderId, driveLink, photoCount: data.photoCount, clientId });
    if (ref) id = ref;
    if (!isDemo) await appendSubmission(drive, root, {
      submissionId: id, submittedAt,
      inspectorName: (data.inspectorName || "").trim(),
      clientName: (data.clientName || "").trim(),
      propertyAddress: (data.propertyAddress || "").trim(),
      inspectionCompany: (data.inspectionCompany || "").trim(),
      inspectionDate: date, driveLink, amountPaid,
    });

    return NextResponse.json({ ok: true, submissionId: id, folderId, path, driveLink, demo: isDemo });
  } catch (err) {
    console.error("submit error", err);
    return NextResponse.json({ ok: false, error: err.message || "Drive error" }, { status: 500 });
  }
}
