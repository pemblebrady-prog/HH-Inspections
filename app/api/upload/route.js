import { NextResponse } from "next/server";
import { getDrive, uploadPhoto } from "../../../lib/drive";

export const runtime = "nodejs";

export async function POST(req) {
  const form = await req.formData();
  const folderId = form.get("folderId");
  const file = form.get("file");

  if (!file || typeof file === "string") {
    return NextResponse.json({ ok: false, error: "No file" }, { status: 400 });
  }

  const drive = getDrive();
  // Simulated mode — pretend it worked so the demo flow completes.
  if (!drive || !folderId) {
    return NextResponse.json({ ok: true, simulated: true });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const override = form.get("filename");
    const name = (typeof override === "string" && override) || file.name || `photo-${Date.now()}.jpg`;
    const res = await uploadPhoto(drive, folderId, name, file.type, buffer);
    return NextResponse.json({ ok: true, id: res.id, name: res.name });
  } catch (err) {
    console.error("upload error", err);
    return NextResponse.json({ ok: false, error: err.message || "Upload failed" }, { status: 500 });
  }
}
