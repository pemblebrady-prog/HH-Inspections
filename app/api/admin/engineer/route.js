import { NextResponse } from "next/server";
import { requireUser, createAdminClient } from "../../../../lib/supabase/server";
import { ENGINEER_COLS } from "../../../../lib/engineers";
import { getDrive, rootFolderId, uploadPrivateImage } from "../../../../lib/drive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const s = (v, max = 80) => String(v == null ? "" : v).trim().slice(0, max);

// Engineers edit their own details; admins can edit any engineer's (?id=).
async function ctx(req) {
  const auth = await requireUser(["admin", "engineer"]);
  if (auth.error) return { error: auth.error };
  const db = createAdminClient();
  if (!db) return { error: NextResponse.json({ ok: false, error: "Database isn't configured." }, { status: 500 }) };
  const me = auth.profile;
  const asked = new URL(req.url).searchParams.get("id");
  const id = me && me.role === "admin" ? asked || me.id : me && me.id;
  if (!id) return { error: NextResponse.json({ ok: false, error: "No engineer selected." }, { status: 400 }) };
  const { data: person, error } = await db.from("profiles").select(ENGINEER_COLS).eq("id", id).maybeSingle();
  if (error) return { error: NextResponse.json({ ok: false, error: /pe_|stamp/i.test(error.message) ? "Run database update 0010 in Supabase first." : error.message }, { status: 500 }) };
  if (!person) return { error: NextResponse.json({ ok: false, error: "Person not found." }, { status: 404 }) };
  if (person.role !== "engineer") return { error: NextResponse.json({ ok: false, error: "This person isn't an engineer. Change their role on People first." }, { status: 400 }) };
  return { db, me, person };
}

export async function GET(req) {
  // Admin with no one picked: list the engineers to choose from.
  const auth = await requireUser(["admin", "engineer"]);
  if (auth.error) return auth.error;
  if (auth.profile && auth.profile.role === "admin" && !new URL(req.url).searchParams.get("id")) {
    const db = createAdminClient();
    const { data, error } = await db.from("profiles").select(ENGINEER_COLS).eq("role", "engineer").order("created_at");
    if (error) return NextResponse.json({ ok: false, error: /pe_|stamp/i.test(error.message) ? "Run database update 0010 in Supabase first." : error.message }, { status: 500 });
    return NextResponse.json({ ok: true, engineers: data || [] });
  }
  const c = await ctx(req); if (c.error) return c.error;
  return NextResponse.json({ ok: true, engineer: c.person, canPickOthers: c.me && c.me.role === "admin" });
}

// Body: { fullName?, title?, licenseNumber?, licenseState?, licenseExpires? (YYYY-MM-DD) }
export async function PATCH(req) {
  const c = await ctx(req); if (c.error) return c.error;
  let b; try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 }); }
  const patch = {};
  if (b.fullName !== undefined) { if (!s(b.fullName)) return NextResponse.json({ ok: false, error: "Enter the name as it appears on letters." }, { status: 400 }); patch.full_name = s(b.fullName); }
  if (b.title !== undefined) patch.pe_title = s(b.title) || null;
  if (b.licenseNumber !== undefined) patch.pe_license_number = s(b.licenseNumber, 40) || null;
  if (b.licenseState !== undefined) patch.pe_license_state = (s(b.licenseState, 20) || "AZ").toUpperCase();
  if (b.licenseExpires !== undefined) {
    const d = s(b.licenseExpires, 10);
    if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) return NextResponse.json({ ok: false, error: "Pick the expiration date." }, { status: 400 });
    patch.pe_license_expires = d || null;
    if (d !== c.person.pe_license_expires) patch.pe_expiry_warned_days = null; // new date: warnings start over
  }
  const { data, error } = await c.db.from("profiles").update(patch).eq("id", c.person.id).select(ENGINEER_COLS).single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, engineer: data });
}

// Stamp or signature image (multipart: kind = "stamp" | "signature", file).
export async function POST(req) {
  const c = await ctx(req); if (c.error) return c.error;
  const form = await req.formData();
  const kind = String(form.get("kind") || "");
  const file = form.get("file");
  if (!["stamp", "signature"].includes(kind)) return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  if (!file || typeof file === "string" || !file.size) return NextResponse.json({ ok: false, error: "Choose an image." }, { status: 400 });
  if (!String(file.type || "").startsWith("image/")) return NextResponse.json({ ok: false, error: "That file isn't an image (use PNG or JPG)." }, { status: 400 });
  if (file.size > 5 * 1024 * 1024) return NextResponse.json({ ok: false, error: "That image is over 5 MB." }, { status: 400 });
  const drive = getDrive();
  if (!drive) return NextResponse.json({ ok: false, error: "Google Drive isn't connected." }, { status: 500 });
  try {
    const name = `${(c.person.full_name || c.person.email).replace(/[\\/:*?"<>|]/g, "-")} - PE ${kind}.${/png/.test(file.type) ? "png" : "jpg"}`;
    const fileId = await uploadPrivateImage(drive, rootFolderId(), "Engineer Stamps (private)", name, file.type, Buffer.from(await file.arrayBuffer()));
    const col = kind === "stamp" ? "stamp_drive_file_id" : "signature_drive_file_id";
    const { data, error } = await c.db.from("profiles").update({ [col]: fileId }).eq("id", c.person.id).select(ENGINEER_COLS).single();
    if (error) throw error;
    return NextResponse.json({ ok: true, engineer: data });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Upload failed" }, { status: 500 });
  }
}
