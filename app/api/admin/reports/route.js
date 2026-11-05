import { NextResponse } from "next/server";
import { requireUser, createAdminClient } from "../../../../lib/supabase/server";
import { readFilters, runReport, toCsv } from "../../../../lib/reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Spreadsheet download of the Reports page (same filters as the page's address).
export async function GET(req) {
  const auth = await requireUser(["admin"]);
  if (auth.error) return auth.error;
  const db = createAdminClient();
  if (!db) return NextResponse.json({ ok: false, error: "Database isn't configured." }, { status: 500 });
  const f = readFilters(Object.fromEntries(new URL(req.url).searchParams));
  const { rows } = await runReport(db, f, { limit: 20000 });
  const name = `HH jobs ${f.from || "start"} to ${f.to || new Date().toLocaleDateString("en-CA", { timeZone: "America/Phoenix" })}.csv`;
  return new Response("﻿" + toCsv(rows), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" },
  });
}
