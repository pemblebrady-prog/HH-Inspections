import { NextResponse } from "next/server";
import { requireUser, createAdminClient } from "../../../../lib/supabase/server";
import { geocode, milesBetween } from "../../../../lib/geo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const LIMIT_MILES = 1;

// How far is the phone from this order's address? Body: { id, lat, lng, accuracy (meters) }
// Returns { ok, far, miles } or { ok, unknown: true } when the address can't be placed on a map.
export async function POST(req) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const db = createAdminClient();
  let b; try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 }); }
  const lat = Number(b.lat), lng = Number(b.lng), acc = Math.max(0, Number(b.accuracy) || 0);
  if (!db || !/^[0-9a-f-]{36}$/i.test(String(b.id || "")) || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  }
  const { data: o } = await db.from("orders").select("*").eq("id", b.id).maybeSingle();
  const me = auth.profile;
  if (!o || (me && me.role !== "admin" && o.inspector_id !== me.id)) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  let spot = o.geo_lat != null && o.geo_lng != null ? { lat: o.geo_lat, lng: o.geo_lng } : null;
  if (!spot) {
    spot = await geocode(o.property_address);
    if (!spot) return NextResponse.json({ ok: true, unknown: true });
    // Remember it (ignored if migration 0012 isn't run yet).
    await db.from("orders").update({ geo_lat: spot.lat, geo_lng: spot.lng, geocoded_at: new Date().toISOString() }).eq("id", o.id).then(() => {}, () => {});
  }
  const miles = milesBetween({ lat, lng }, spot);
  // Give the phone the benefit of the doubt: subtract how unsure its GPS is.
  const far = miles - acc / 1609.34 > LIMIT_MILES;
  return NextResponse.json({ ok: true, far, miles: Math.round(miles * 10) / 10 });
}
