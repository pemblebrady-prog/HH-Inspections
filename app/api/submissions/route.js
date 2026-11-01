import { NextResponse } from "next/server";
import { requireUser } from "../../../lib/supabase/server";
import { getDrive, rootFolderId, readSubmissions } from "../../../lib/drive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // always re-fetch from Drive; never cache this response

export async function GET() {
  const auth = await requireUser(["admin"]);
  if (auth.error) return auth.error;
  const drive = getDrive();
  if (!drive) {
    return NextResponse.json({ ok: true, records: [], simulated: true });
  }
  try {
    const { records } = await readSubmissions(drive, rootFolderId());
    records.sort((a, b) => String(b.submittedAt || "").localeCompare(String(a.submittedAt || "")));
    return NextResponse.json({ ok: true, records });
  } catch (err) {
    console.error("submissions read error", err);
    return NextResponse.json({ ok: false, error: err.message || "Read failed" }, { status: 500 });
  }
}
