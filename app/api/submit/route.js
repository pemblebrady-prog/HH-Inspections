import { NextResponse } from "next/server";
import { getDrive, rootFolderId, ensureFolderPath, writeMetadata } from "../../../lib/drive";

export const runtime = "nodejs";

function submissionId() {
  return "HH-" + Math.random().toString(36).slice(2, 7).toUpperCase();
}

function monthYearFrom(dateStr) {
  const d = dateStr ? new Date(dateStr + "T00:00:00") : new Date();
  if (isNaN(d)) return "Undated";
  return d.toLocaleString("en-US", { month: "long" }) + " " + d.getFullYear(); // "July 2025"
}

// Keep folder names filesystem-friendly.
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
  const date = (data.date || new Date().toISOString().slice(0, 10)).trim();
  const monthYear = monthYearFrom(date);
  const inspector = clean(data.inspectorName);
  const client = clean(data.clientName);
  const path = [monthYear, inspector, client]; // Month Year / Inspector / Client

  const drive = getDrive();
  if (!drive) {
    return NextResponse.json({ ok: true, simulated: true, submissionId: id, path: path.join(" / ") });
  }

  try {
    const folderId = await ensureFolderPath(drive, rootFolderId(), path);
    await writeMetadata(drive, folderId, {
      submissionId: id,
      submittedAt: new Date().toISOString(),
      report: data,
      feePaid: Number(process.env.NEXT_PUBLIC_CERT_FEE || 135),
      status: "Paid · queued for engineer",
    });
    return NextResponse.json({ ok: true, submissionId: id, folderId, path: path.join(" / ") });
  } catch (err) {
    console.error("submit error", err);
    return NextResponse.json({ ok: false, error: err.message || "Drive error" }, { status: 500 });
  }
}
