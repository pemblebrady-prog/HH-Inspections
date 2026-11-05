// Address → map coordinates, and distance between two points.
// Uses the free US Census geocoder first, then OpenStreetMap (Nominatim) as a fallback.

const UA = "HH-Inspector-Portal/1.0 (House and Home AZ Inspection Service)";

async function census(address) {
  const u = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?${new URLSearchParams({ address, benchmark: "Public_AR_Current", format: "json" })}`;
  const r = await fetch(u, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000), cache: "no-store" });
  if (!r.ok) return null;
  const m = (await r.json())?.result?.addressMatches?.[0];
  return m ? { lat: m.coordinates.y, lng: m.coordinates.x, source: "census" } : null;
}

async function nominatim(address) {
  const u = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({ q: address, format: "json", limit: "1", countrycodes: "us" })}`;
  const r = await fetch(u, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(8000), cache: "no-store" });
  if (!r.ok) return null;
  const m = (await r.json())?.[0];
  return m ? { lat: Number(m.lat), lng: Number(m.lon), source: "osm" } : null;
}

export async function geocode(address) {
  const a = String(address || "").trim();
  if (!a) return null;
  for (const fn of [census, nominatim]) {
    try { const hit = await fn(a); if (hit && Number.isFinite(hit.lat) && Number.isFinite(hit.lng)) return hit; }
    catch (e) { console.error("geocode failed", fn.name, e.message); }
  }
  return null;
}

// Straight-line distance in miles.
export function milesBetween(a, b) {
  const R = 3958.8, rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
