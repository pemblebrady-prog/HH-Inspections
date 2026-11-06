import { NextResponse } from "next/server";
import { requireUser } from "../../../../lib/supabase/server";
import { checkPhoto, photoAIEnabled } from "../../../../lib/photoAI";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Check one photo (multipart: slot, photo). Returns { ok, check } or { ok, off: true } when not set up.
export async function POST(req) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  if (!photoAIEnabled()) return NextResponse.json({ ok: true, off: true });
  try {
    const form = await req.formData();
    const slot = String(form.get("slot") || "");
    const file = form.get("photo");
    if (!file || typeof file === "string" || !String(file.type).startsWith("image/")) return NextResponse.json({ ok: false, error: "No photo" }, { status: 400 });
    if (file.size > 4 * 1024 * 1024) return NextResponse.json({ ok: false, error: "Photo too large" }, { status: 400 });
    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const check = await checkPhoto({ slot, base64, mediaType: file.type });
    return NextResponse.json({ ok: true, check });
  } catch (e) {
    console.error("photo check failed", e.message);
    return NextResponse.json({ ok: false, error: "Couldn't check this photo." }, { status: 502 });
  }
}
