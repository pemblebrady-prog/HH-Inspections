import { NextResponse } from "next/server";
import { getDrive, rootFolderId, ensureSubmissionFolder, writeMetadata } from "../../../lib/drive";

export const runtime = "nodejs"; // googleapis needs the Node runtime, not Edge

function submissionId() {
  return "HH-" + Math.random().toString(36).slice(2, 7).toUpperCase();
}

export async function POST(req) {
  let data;
  try {
    data = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  }

  const id = submissionId();
  const address = (data.address || "").trim();
  const city = (data.city || "").trim();
  const date = (data.date || new Date().toISOString().slice(0, 10)).trim();
  const folderName = [address, city].filter(Boolean).join(", ") || "Unknown address";

  const drive = getDrive();

  // Simulated mode: Drive not configured yet. Let the demo work anyway.
  if (!drive) {
    return NextResponse.json({ ok: true, simulated: true, submissionId: id });
  }

  try {
    const folderId = await ensureSubmissionFolder(drive, rootFolderId(), folderName, date);
    await writeMetadata(drive, folderId, {
      submissionId: id,
      submittedAt: new Date().toISOString(),
      property: { address, city, state: data.state || "AZ", zip: data.zip || "", loanType: data.loan || "" },
      inspector: { name: data.iname || "", company: data.icompany || "", email: data.iemail || "", phone: data.iphone || "" },
      checklist: data.checklist || {},
      comments: data.notes || "",
      feePaid: Number(process.env.NEXT_PUBLIC_CERT_FEE || 135),
      status: "Paid · queued for engineer",
    });
    return NextResponse.json({ ok: true, submissionId: id, folderId });
  } catch (err) {
    console.error("submit error", err);
    return NextResponse.json({ ok: false, error: err.message || "Drive error" }, { status: 500 });
  }
}
