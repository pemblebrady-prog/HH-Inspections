import { NextResponse } from "next/server";
import { getDrive, rootFolderId, readCompanies, readSubmissions, findOrCreateFolder, createGoogleDocFromHtml } from "../../../../lib/drive";
import { buildStatementHtml } from "../../../../lib/statementTemplate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATEMENTS_FOLDER = "Monthly Statements";

function monthLabel(monthYear) {
  const [y, m] = (monthYear || "").split("-");
  if (!y || !m) return monthYear || "—";
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleString("en-US", { month: "long", year: "numeric" });
}

export async function POST(req) {
  let data;
  try { data = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 }); }

  const { companyName, monthYear } = data; // monthYear like "2026-07"
  if (!companyName || !monthYear) {
    return NextResponse.json({ ok: false, error: "Company and month are required." }, { status: 400 });
  }

  const drive = getDrive();
  if (!drive) return NextResponse.json({ ok: true, simulated: true });

  try {
    const root = rootFolderId();
    const { companies } = await readCompanies(drive, root);
    const company = companies.find((c) => c.name === companyName);
    if (!company) return NextResponse.json({ ok: false, error: "Company not found." }, { status: 404 });

    const { records } = await readSubmissions(drive, root);
    const rows = records
      .filter((r) => r.inspectionCompany === companyName && String(r.inspectionDate || "").startsWith(monthYear))
      .sort((a, b) => String(a.inspectionDate || "").localeCompare(String(b.inspectionDate || "")));

    const label = monthLabel(monthYear);
    const statementNumber = `${companyName.replace(/\s+/g, "").toUpperCase().slice(0, 6)}-${monthYear}`;
    const html = buildStatementHtml({ company, monthLabel: label, statementNumber, rows });

    const folderId = await findOrCreateFolder(drive, STATEMENTS_FOLDER, root);
    const doc = await createGoogleDocFromHtml(drive, folderId, `${companyName} - ${label} Statement`, html);

    const total = rows.reduce((sum, r) => sum + (Number(r.amountPaid) || 0), 0);
    return NextResponse.json({ ok: true, docId: doc.id, docLink: doc.webViewLink, count: rows.length, total });
  } catch (err) {
    console.error("statement generation error", err);
    return NextResponse.json({ ok: false, error: err.message || "Statement generation failed" }, { status: 500 });
  }
}
