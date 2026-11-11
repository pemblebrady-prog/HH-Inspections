import { getDrive, rootFolderId, readCompanies, fileToDataUri, createGoogleDocFromHtml } from "./drive";
import { buildLetterHtml } from "./letterTemplate";
import { letterEngineer } from "./engineers";

// Build the draft certification letter as a Google Doc in the job's Drive folder.
// images: [{ id, label, slot }] (Drive file ids). engineer: from lib/engineers (who certifies it).
// Returns { docId, docLink, engineerId } or { simulated }.
export async function generateLetter({ folderId, report, companyName, images, engineer }) {
  const drive = await getDrive();
  if (!drive || !folderId) return { simulated: true };

  let company = null, logoDataUri = null;
  if (companyName) {
    const { companies } = await readCompanies(drive, rootFolderId());
    company = companies.find((c) => c.name === companyName) || null;
    if (company && company.logoFileId) {
      try { logoDataUri = await fileToDataUri(drive, company.logoFileId); } catch { /* text header instead */ }
    }
  }

  const embedded = [];
  for (const img of images || []) {
    try { embedded.push({ label: img.label, slot: img.slot, dataUri: await fileToDataUri(drive, img.id) }); }
    catch (e) { console.error("letter: could not embed image", img.id, e.message); }
  }

  // The engineer's stamp and signature (private Drive images), embedded when uploaded.
  const eng = engineer || letterEngineer(null);
  const stampDataUri = eng.stampFileId ? await fileToDataUri(drive, eng.stampFileId).catch(() => null) : null;
  const signatureDataUri = eng.signatureFileId ? await fileToDataUri(drive, eng.signatureFileId).catch(() => null) : null;

  const html = buildLetterHtml({ report, company, logoDataUri, images: embedded, engineer: { ...eng, stampDataUri, signatureDataUri } });
  const clientName = (report.clientName || "Client").trim();
  const doc = await createGoogleDocFromHtml(drive, folderId, `${clientName} - Certification Report (Draft)`, html);
  return { docId: doc.id, docLink: doc.webViewLink, engineerId: eng.id || null };
}
