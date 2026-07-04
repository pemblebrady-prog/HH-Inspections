import { NextResponse } from "next/server";
import { getDrive, rootFolderId, ensureFolderPath, appendSubmission } from "../../../lib/drive";

export const runtime = "nodejs";

function submissionId() {
  return "HH-" + Math.random().toString(36).slice(2, 7).toUpperCase();
}

function monthYearFrom(dateStr) {
  const d = dateStr ? new Date(dateStr + "T00:00:00") : new Date();
  if (isNaN(d)) return "Undated";
  return d.toLocaleString("en-US", { month: "long" }) + " " + d.getFullYear();
}

function clean(s) {
  return (s || "").trim().replace(/[\\/:*?"<>|]/g, "-") || "Unknown";
}

export async function POST(req) {
  let data;
  try {
    data = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  }

  const id = submissionId();
  const submittedAt = new Date().toISOString();
  const date = (data.date || new Date().toISOString().slice(0, 10)).trim();
  const monthYear = monthYearFrom(date);
  const inspector = clean(data.inspectorName);
  const client = clean(data.clientName);
  const path = [monthYear, inspector, client];
  const amountPaid = Number(process.env.NEXT_PUBLIC_CERT_FEE || 135);

  const drive = getDrive();
  if (!drive) {
    return NextResponse.json({ ok: true, simulated: true, submissionId: id, path: path.join(" / ") });
  }

  try {
    const folderId = await ensureFolderPath(drive, rootFolderId(), path);
    const driveLink = `https://drive.google.com/drive/folders/${folderId}`;

    // Record to the central tracking index (no JSON left in the client folder).
    await appendSubmission(drive, rootFolderId(), {
      submissionId: id,
      submittedAt,
      inspectorName: (data.inspectorName || "").trim(),
      clientName: (data.clientName || "").trim(),
      inspectionDate: date,
      driveLink,
      amountPaid,
    });

    return NextResponse.json({ ok: true, submissionId: id, folderId, path: path.join(" / "), driveLink });
  } catch (err) {
    console.error("submit error", err);
    return NextResponse.json({ ok: false, error: err.message || "Drive error" }, { status: 500 });
  }
}
