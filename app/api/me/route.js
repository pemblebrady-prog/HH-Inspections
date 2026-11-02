import { NextResponse } from "next/server";
import { requireUser } from "../../../lib/supabase/server";

export const dynamic = "force-dynamic";

// The signed-in person's basic profile (for headers and menus).
export async function GET() {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const p = auth.profile;
  if (!p) return NextResponse.json({ ok: true, profile: null });
  return NextResponse.json({ ok: true, profile: {
    id: p.id, email: p.email, full_name: p.full_name, role: p.role,
    company: p.company ? { name: p.company.name, is_internal: p.company.is_internal } : null,
  } });
}
