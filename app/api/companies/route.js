import { NextResponse } from "next/server";
import { getDrive, rootFolderId, readCompanies } from "../../../lib/drive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // always re-fetch from Drive; never cache this response

export async function GET() {
  const drive = getDrive();
  if (!drive) return NextResponse.json({ ok: true, companies: [], simulated: true });
  try {
    const { companies } = await readCompanies(drive, rootFolderId());
    companies.sort((a, b) => a.name.localeCompare(b.name));
    return NextResponse.json({ ok: true, companies });
  } catch (err) {
    console.error("companies read error", err);
    return NextResponse.json({ ok: false, error: err.message || "Read failed" }, { status: 500 });
  }
}
