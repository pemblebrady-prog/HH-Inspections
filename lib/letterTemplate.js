import { PHOTO_SLOTS } from "./formConfig.js";
import {
  ENGINEER, DOCUMENT_ID, DEFAULT_COMPANY, STANDARD_PARAGRAPH, PASS_STATEMENT,
  CORRECTIONS_HEADING, CONTRACTORS_HEADING, CONTRACTORS, buildFindings,
} from "./letterContent.js";

function esc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function longDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  if (!m) return iso || "";
  return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString("en-US", { month: "long", day: "2-digit", year: "numeric" });
}
function homeTypeWords(t) {
  return { "Single-Wide": "Single wide", "Double-Wide": "Double wide", "Triple-Wide": "Triple wide" }[t] || "";
}

const P = 'style="margin:0 0 10px;"';
const IMG = (img) => `<p style="margin:6px 0 14px;"><img src="${img.dataUri}" style="max-width:460px;width:100%;" alt="${esc(img.label)}" /></p>`;

// Certification letter in Ron Rath's format.
// images: [{ label, dataUri, slot }] where slot is a PHOTO_SLOTS id or "sketch".
export function buildLetterHtml({ report: f, company, logoDataUri, images = [] }) {
  const co = company && company.name ? company : DEFAULT_COMPANY;
  const header = logoDataUri
    ? `<img src="${logoDataUri}" style="max-height:80px;max-width:340px;" alt="${esc(co.name)}" />`
    : `<h1 style="font-family:Georgia,serif;font-size:30px;margin:0;">${esc(co.name)}</h1>`;

  const bySlot = {};
  for (const img of images) (bySlot[img.slot || "other"] = bySlot[img.slot || "other"] || []).push(img);
  const used = new Set();
  const photosFor = (slots) => slots.flatMap((s) => { if (used.has(s)) return []; used.add(s); return bySlot[s] || []; }).map(IMG).join("");

  const { tagLine, findings, corrections } = buildFindings(f);

  const addr = esc(f.propertyAddress || "");
  const sqft = (f.sqft || "").trim();
  const homeWords = homeTypeWords(f.homeType);
  const listed = [sqft ? `${esc(sqft)} Sq-ft` : "", esc(homeWords)].filter(Boolean).join(" ");
  const dims = f.widthFt || f.lengthFt ? `${esc(f.widthFt || "?")}' x ${esc(f.lengthFt || "?")}'` : "";

  // Order matters: claim photos in the order they appear in the letter.
  const sidesHtml = photosFor(["p01"]);
  const tagsHtml = photosFor(["p03"]);
  const findingsHtml = findings.map((x) => `<p ${P}>${esc(x.text)}</p>${photosFor(x.slots)}`).join("");

  const resultHtml = corrections.length
    ? `<p style="margin:18px 0 8px;"><b>${esc(CORRECTIONS_HEADING)}</b></p>
       <ol style="margin:0 0 12px 22px;padding:0;">${corrections.map((c) => `<li style="margin:4px 0;">${esc(c)}</li>`).join("")}</ol>
       ${photosFor(["p02"])}
       <p style="margin:18px 0 8px;">${esc(CONTRACTORS_HEADING)}</p>
       <ol style="margin:0 0 12px 22px;padding:0;">${CONTRACTORS.map((c) => `<li style="margin:3px 0;">${esc(c)}</li>`).join("")}</ol>`
    : `<p style="margin:18px 0 10px;">${esc(PASS_STATEMENT)}</p>${photosFor(["p02"])}`;

  // Anything not placed next to a finding goes at the end.
  const leftover = ["p01", "p03", "p08", "p10", "other", "sketch", ...PHOTO_SLOTS.map((s) => s.id)]
    .filter((s, i, a) => a.indexOf(s) === i && !used.has(s) && (bySlot[s] || []).length);
  const leftoverHtml = leftover.length
    ? `<p style="margin:22px 0 8px;"><b>Additional photos</b></p>` +
      leftover.map((s) => `<p style="margin:10px 0 4px;color:#555;">${esc((bySlot[s][0] || {}).label || "")}</p>${photosFor([s])}`).join("")
    : "";

  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:Calibri,Arial,sans-serif;color:#111;font-size:12pt;max-width:700px;">

<p style="background:#fff8e1;border:1px dashed #c9a227;padding:8px 12px;color:#7a5b00;font-size:10pt;">
DRAFT generated from the inspector's submission. Review every sentence, add the PE stamp and signature, then delete this note.</p>

${header}

<table style="width:100%;margin:16px 0 10px;border-collapse:collapse;"><tr>
  <td style="vertical-align:top;width:52%;padding:0;">
    <p ${P}>Date of Inspection: ${esc(longDate(f.date))}</p>
    <p ${P}>Date of Re-inspection:</p>
    <p ${P}>Address: ${addr}</p>
  </td>
  <td style="vertical-align:top;width:48%;padding:0;">
    <p ${P}>Type of Inspection: Manufactured Home Foundation Inspection</p>
    <p ${P}>Licensed Inspector: ${esc(ENGINEER.name)} ${esc(ENGINEER.title)}</p>
    <p ${P}>Client: ${esc(f.clientName || "")}</p>
  </td>
</tr></table>

<p ${P}>Dear: To whom it may concern</p>

<p style="margin:14px 0 6px;"><b>Property Description:</b></p>
<p style="margin:0 0 4px;">Listed Year built: ${esc(f.ageOfHome || "")}</p>
<p style="margin:0 0 4px;">Listed: ${listed}</p>
<p style="margin:0 0 4px;">Dimensions: ${dims}</p>
<p style="margin:0 0 12px;">Loan type: ${esc(f.inspectionType && f.inspectionType !== "Unknown" ? f.inspectionType : "")}</p>

<p ${P}>${esc(STANDARD_PARAGRAPH)}</p>
${sidesHtml}

${tagLine ? `<p ${P}>${esc(tagLine)}</p>` : ""}
${tagsHtml}

${findingsHtml}

${f.generalComments ? `<p ${P}>${esc(f.generalComments)}</p>` : ""}

${resultHtml}

${leftoverHtml}

<table style="width:100%;margin-top:36px;border-collapse:collapse;"><tr>
  <td style="vertical-align:bottom;width:60%;padding:0;">
    <p style="margin:0;">${esc(co.name)}</p>
    <p style="margin:0;">${esc(ENGINEER.name)}</p>
    <p style="margin:0;">${esc(ENGINEER.title)}</p>
    <p style="margin:0;">${esc(co.phone || "")}</p>
    <p style="margin:0;">${esc(co.email || "")}</p>
  </td>
  <td style="vertical-align:bottom;width:40%;text-align:right;padding:0;color:#888;">[PE stamp &amp; signature]</td>
</tr></table>

<p style="margin-top:28px;color:#666;font-size:9pt;">${esc(DOCUMENT_ID)}</p>
</body></html>`;
}
