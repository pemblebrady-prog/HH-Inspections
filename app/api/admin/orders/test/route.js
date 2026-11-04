import { NextResponse } from "next/server";
import { requireUser } from "../../../../../lib/supabase/server";
import { gfDiagnose } from "../../../../../lib/gravity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admins: /api/admin/orders/test?entry=418 shows how the website answers (no secrets shown).
export async function GET(req) {
  const auth = await requireUser(["admin"]);
  if (auth.error) return auth.error;
  const entry = Number(new URL(req.url).searchParams.get("entry")) || 1;
  return NextResponse.json(await gfDiagnose(entry), { headers: { "Cache-Control": "no-store" } });
}
