import { NextResponse } from "next/server";
import { getDrive, rootFolderId, readCompanies, fileToDataUri, createGoogleDocFromHtml } from "../../../lib/drive";
import { buildLetterHtml } from "../../../lib/letterTemplate";

export const runtime = "nodejs";

export async function POST(req) {
  let data;
  try { data = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 }); }

  const { folderId, report, companyName, images } = data; // images: [{id, label}] in report order
  const drive = getDrive();
  if (!drive || !folderId) {
    return NextResponse.json({ ok: true, simulated: true });
  }

  try {
    // Resolve the selected company's branding (logo + contact info), if one was chosen.
    let company = null, logoDataUri = null;
    if (companyName) {
      const { companies } = await readCompanies(drive, rootFolderId());
      company = companies.find((c) => c.name === companyName) || null;
      if (company && company.logoFileId) {
        try { logoDataUri = await fileToDataUri(drive, company.logoFileId); } catch { /* fall back to text header */ }
      }
    }

    // Pull each uploaded photo's bytes back from Drive to embed in the doc.
    const embedded = [];
    for (const img of images || []) {
      try {
        const dataUri = await fileToDataUri(drive, img.id);
        embedded.push({ label: img.label, dataUri });
      } catch (e) {
        console.error("letter: could not embed image", img.id, e.message);
      }
    }

    const html = buildLetterHtml({ report, company, logoDataUri, images: embedded });
    const clientName = (report.clientName || "Client").trim();
    const doc = await createGoogleDocFromHtml(drive, folderId, `${clientName} - Certification Report (Draft)`, html);

    return NextResponse.json({ ok: true, docId: doc.id, docLink: doc.webViewLink });
  } catch (err) {
    console.error("letter generation error", err);
    // Non-fatal by design — the submission itself already succeeded.
    return NextResponse.json({ ok: false, error: err.message || "Letter generation failed" }, { status: 500 });
  }
}
