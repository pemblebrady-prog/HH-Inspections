import { NextResponse } from "next/server";
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
function clean(s) {
  return (s || "").trim().replace(/[\\/:*?"<>|]/g, "-") || "Unknown";
}

export async function POST(req) {
  let data;
  try { data = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 }); }

  const id = submissionId();
  const submittedAt = new Date().toISOString();
  const date = (data.date || new Date().toISOString().slice(0, 10)).trim();
  const monthYear = monthYearFrom(date);
  const inspector = clean(data.inspectorName);
  const clientBase = `${clean(data.clientName)} - ${mmddyyyy(date)}`;
  const amountPaid = Number(process.env.NEXT_PUBLIC_CERT_FEE || 135);

  const drive = getDrive();
  if (!drive) {
    return NextResponse.json({ ok: true, simulated: true, submissionId: id, path: `${monthYear} / ${inspector} / ${clientBase}` });
  }

  try {
    // Month / Inspector reuse existing folders; the client folder is always unique per submission.
    const root = rootFolderId();
    const monthId = await findOrCreateFolder(drive, monthYear, root);
    const inspectorId = await findOrCreateFolder(drive, inspector, monthId);
    const { id: folderId, name: clientFolderName } = await createUniqueFolder(drive, clientBase, inspectorId);
    const driveLink = `https://drive.google.com/drive/folders/${folderId}`;
    const path = `${monthYear} / ${inspector} / ${clientFolderName}`;

    await appendSubmission(drive, root, {
      submissionId: id, submittedAt,
      inspectorName: (data.inspectorName || "").trim(),
      clientName: (data.clientName || "").trim(),
      inspectionCompany: (data.inspectionCompany || "").trim(), // used by the letter generator (next step)
      inspectionDate: date, driveLink, amountPaid,
    });

    return NextResponse.json({ ok: true, submissionId: id, folderId, path, driveLink });
  } catch (err) {
    console.error("submit error", err);
    return NextResponse.json({ ok: false, error: err.message || "Drive error" }, { status: 500 });
  }
}
