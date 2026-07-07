import { NextResponse } from "next/server";
import { sendEmail } from "../../../../lib/email";
import { buildReceiptEmailHtml } from "../../../../lib/emailTemplates";

export const runtime = "nodejs";

export async function POST(req) {
  let data;
  try { data = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 }); }

  const { to } = data;
  if (!to) return NextResponse.json({ ok: false, error: "Missing recipient" }, { status: 400 });

  try {
    const html = buildReceiptEmailHtml(data);
    const res = await sendEmail({ to, subject: `Payment received — ${data.clientName || "certification submission"}`, html });
    return NextResponse.json({ ok: true, ...res });
  } catch (err) {
    console.error("receipt email error", err);
    // Non-fatal by design — the submission itself already succeeded.
    return NextResponse.json({ ok: false, error: err.message || "Send failed" }, { status: 500 });
  }
}
