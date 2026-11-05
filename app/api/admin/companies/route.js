import { NextResponse } from "next/server";
import { requireUser, createAdminClient } from "../../../../lib/supabase/server";
import { listCompanies } from "../../../../lib/companyAdmin";
import { parseDollars } from "../../../../lib/pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ctx() {
  const auth = await requireUser(["admin"]);
  if (auth.error) return { error: auth.error };
  const db = createAdminClient();
  if (!db) return { error: NextResponse.json({ ok: false, error: "Database isn't configured." }, { status: 500 }) };
  return { db, me: auth.profile };
}

export async function GET() {
  const c = await ctx(); if (c.error) return c.error;
  try { return NextResponse.json({ ok: true, ...(await listCompanies(c.db)) }); }
  catch (e) { return NextResponse.json({ ok: false, error: e.message }, { status: 500 }); }
}

// Add a company. Body: { name, price? }
export async function POST(req) {
  const c = await ctx(); if (c.error) return c.error;
  let b; try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 }); }
  const name = String(b.name || "").trim().slice(0, 120);
  if (!name) return NextResponse.json({ ok: false, error: "Enter the company name." }, { status: 400 });
  const price = parseDollars(b.price);
  if (Number.isNaN(price)) return NextResponse.json({ ok: false, error: "Enter a price like 135, or leave it blank to use the default." }, { status: 400 });
  const { data: dupe } = await c.db.from("companies").select("id").ilike("name", name).maybeSingle();
  if (dupe) return NextResponse.json({ ok: false, error: "A company with that name already exists.", id: dupe.id }, { status: 400 });
  const { data, error } = await c.db.from("companies").insert({ name, price_cents: price }).select("id").single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}
