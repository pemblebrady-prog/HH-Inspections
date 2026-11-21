import { getDrive, rootFolderId, readCompanies, fileToDataUri, createGoogleDocFromHtml } from "./drive";
import { buildLetterHtml } from "./letterTemplate";
import { letterEngineer } from "./engineers";

// The company a job's letter is branded for, from the database (so renames and new logos apply):
// the job's own company, or for House & Home inspectors the company picked on the form.
// Returns { name, logoFileId, phone, email } or null (House & Home branding).
export async function companyForLetter(db, sub) {
  if (!db || !sub) return null;
  const toLetter = (c) => (c && !c.is_internal ? { name: c.name, logoFileId: c.logo_drive_file_id || null, phone: c.phone || "", email: c.email || "" } : null);
  const cols = "name, logo_drive_file_id, phone, email, is_internal";
  if (sub.company_id) {
    const { data } = await db.from("companies").select(cols).eq("id", sub.company_id).maybeSingle();
    if (data && !data.is_internal) return toLetter(data);
  }
  const picked = sub.report && String(sub.report.inspectionCompany || "").trim();
  if (picked) {
    const { data } = await db.from("companies").select(cols).ilike("name", picked.replace(/[%_\\]/g, "\\$&")).limit(1);
    if (data && data[0]) return toLetter(data[0]);
    return { name: picked, logoFileId: null }; // not in the database: look it up in the old Drive list
  }
  return null;
}

// Build the draft certification letter as a Google Doc in the job's Drive folder.
// images: [{ id, label, slot }] (Drive file ids). engineer: from lib/engineers (who certifies it).
// Returns { docId, docLink, engineerId } or { simulated }.
// company: from companyForLetter (preferred); companyName: older callers, looked up in the Drive list.
// mode / corrections / feeCents / followup: see buildLetterHtml (corrections and clear letters).
// followup photos are Drive ids here ({ items: [{ correction, note, photos: [{ id, label }] }], extra: [{ id, label }] }).
export async function generateLetter({ folderId, report, companyName, company: dbCompany, images, engineer, mode = "certification", corrections, feeCents, followup }) {
  const drive = await getDrive();
  if (!drive || !folderId) return { simulated: true };

  let company = null, logoDataUri = null;
  if (dbCompany && dbCompany.logoFileId) company = dbCompany;
  else if (dbCompany || companyName) {
    const name = dbCompany ? dbCompany.name : companyName;
    const { companies } = await readCompanies(drive, rootFolderId());
    const found = companies.find((c) => c.name.toLowerCase() === name.toLowerCase()) || null;
    company = found ? { ...found, ...(dbCompany || {}), logoFileId: found.logoFileId } : (dbCompany || null);
  }
  if (company) {
    if (company.logoFileId) {
      try { logoDataUri = await fileToDataUri(drive, company.logoFileId); } catch { /* text header instead */ }
    }
  }

  const embedded = [];
  for (const img of images || []) {
    try { embedded.push({ label: img.label, slot: img.slot, dataUri: await fileToDataUri(drive, img.id) }); }
    catch (e) { console.error("letter: could not embed image", img.id, e.message); }
  }

  let fu = null;
  if (followup) {
    const embedAll = async (list) => {
      const out = [];
      for (const p of list || []) {
        try { out.push({ label: p.label, slot: "followup", dataUri: await fileToDataUri(drive, p.id) }); }
        catch (e) { console.error("letter: could not embed follow-up photo", p.id, e.message); }
      }
      return out;
    };
    fu = { ...followup, items: [], extra: await embedAll(followup.extra) };
    for (const it of followup.items || []) fu.items.push({ ...it, photos: await embedAll(it.photos) });
  }

  // The engineer's stamp and signature (private Drive images), embedded when uploaded.
  const eng = engineer || letterEngineer(null);

  const html = buildLetterHtml({ report, company, logoDataUri, images: embedded, engineer: eng, mode, corrections, feeCents, followup: fu }); // stamp/signature go on the final PDF (lib/stampPdf.js)
  const clientName = (report.clientName || "Client").trim();
  const doc = await createGoogleDocFromHtml(drive, folderId, `${clientName} - ${mode === "corrections" ? "Corrections Letter" : mode === "clear" ? "Clear Letter" : "Certification Report"} (Draft)`, html);
  return { docId: doc.id, docLink: doc.webViewLink, engineerId: eng.id || null };
}
