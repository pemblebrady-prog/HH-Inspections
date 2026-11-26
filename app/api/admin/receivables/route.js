import { NextResponse } from "next/server";
import { requireUser, createAdminClient } from "../../../../lib/supabase/server";
import { receivables, receivablesCsv, sendArReminder } from "../../../../lib/receivables";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Accounts receivable spreadsheet (office only).
export async function GET() {
  const auth = await requireUser(["admin"]);
  if (auth.error) return auth.error;
  const db = createAdminClient();
  if (!db) return NextResponse.json({ ok: false, error: "Database isn't configured." }, { status: 500 });
  const data = await receivables(db);
  const day = new Date().toLocaleDateString("en-CA", { timeZone: "America/Phoenix" });
  return new Response("﻿" + receivablesCsv(data), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="HH accounts receivable ${day}.csv"`, "Cache-Control": "no-store" },
  });
}

// Send a payment reminder for one item. Body: { ref, kind: "job"|"fee", round? }
export async function POST(req) {
  const auth = await requireUser(["admin"]);
  if (auth.error) return auth.error;
  const db = createAdminClient();
  if (!db) return NextResponse.json({ ok: false, error: "Database isn't configured." }, { status: 500 });
  let b; try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 }); }
  try {
    const sent = await sendArReminder(db, { ref: String(b.ref || ""), kind: b.kind === "fee" ? "fee" : "job", round: b.round, origin: new URL(req.url).origin });
    return NextResponse.json({ ok: true, sent });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Couldn't send the reminder." }, { status: 400 });
  }
}
