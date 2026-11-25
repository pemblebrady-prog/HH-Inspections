import { PHOTO_SLOTS } from "./formConfig.js";
import { STAMP_MARKER_DATA_URI } from "./stampMarker.js";
import {
  ENGINEER, DOCUMENT_ID, DEFAULT_COMPANY, STANDARD_PARAGRAPH, PASS_STATEMENT,
  CORRECTIONS_HEADING, CONTRACTORS_HEADING, CONTRACTORS, buildFindings,
  NEXT_STEPS_HEADING, NEXT_STEPS_INTRO, NEXT_STEPS_OPTIONS, NEXT_STEPS_FEE, NEXT_STEPS_CLOSE,
  CLEAR_ORIGINAL_HEADING, CLEAR_DONE_HEADING, CLEAR_DONE_INTRO,
} from "./letterContent.js";

const fill = (t, vals) => t.replace(/\{(\w+)\}/g, (m, k) => (vals[k] != null ? vals[k] : m));
const money = (c) => `$${(Number(c || 0) / 100).toFixed(Number(c) % 100 ? 2 : 0)}`;
const isoDay = (iso) => (iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Phoenix" }) : "");

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
// Pixel size from a PNG/JPEG data URI header, so the Google Doc gets an explicit size
// (Docs ignores max-width and drops large images in at full size, off the page).
export function imageSize(dataUri) {
  try {
    const b64 = String(dataUri || "").split(",")[1] || "";
    const b = Buffer.from(b64.slice(0, 200000), "base64");
    if (b[0] === 0x89 && b[1] === 0x50) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
    if (b[0] === 0xff && b[1] === 0xd8) {
      let i = 2;
      while (i + 9 < b.length) {
        if (b[i] !== 0xff) { i++; continue; }
        const m = b[i + 1], len = b.readUInt16BE(i + 2);
        if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) };
        i += 2 + len;
      }
    }
  } catch { /* unknown format */ }
  return null;
}
const PAGE_W = 620; // printable width of a letter page at 96 dpi, less a little
const IMG = (img) => {
  const max = img.slot === "sketch" ? PAGE_W : 460;
  const sz = imageSize(img.dataUri);
  const w = sz && sz.w ? Math.min(max, sz.w) : max;
  const h = sz && sz.w ? Math.round((sz.h * w) / sz.w) : null;
  const dims = h ? ` width="${w}" height="${h}" style="width:${w}px;height:${h}px;"` : ` width="${w}" style="width:${w}px;"`;
  return `<p style="margin:6px 0 14px;"><img src="${img.dataUri}"${dims} alt="${esc(img.label)}" /></p>`;
};

// Certification letter in Ron Rath's format.
// images: [{ label, dataUri, slot }] where slot is a PHOTO_SLOTS id or "sketch".
// mode: "certification" (default), "corrections" (failed: what to fix and the next steps) or
// "clear" (the follow-up fixed it: the final certification after a corrections letter).
//   corrections: the list Ron chose (corrections mode; defaults to the checklist's).
//   feeCents: re-inspection fee named in the corrections letter (0 = not mentioned).
//   followup (clear mode): { sentAt, date, by: "inspector" | "house_and_home", items: [{ correction, note, photos: [{ label, dataUri }] }], extra: [photos] }
export function buildLetterHtml({ report: f, company, logoDataUri, images = [], engineer, mode = "certification", corrections: chosen, feeCents = 0, followup = null }) {
  const co = company && company.name ? company : DEFAULT_COMPANY;
  const eng = { name: ENGINEER.name, title: ENGINEER.title, ...(engineer || {}) };
  const licenseLine = eng.license ? `${eng.state ? esc(eng.state) + " " : ""}PE #${esc(eng.license)}` : "";
  // Stamp and signature on file: the draft carries a grey box, and the real images go on the final PDF
  // when it's sent (after the engineer certifies). Otherwise the engineer adds them in the doc by hand.
  const hasMarks = Boolean(eng.stampFileId || eng.signatureFileId || eng.stampDataUri || eng.signatureDataUri);
  const marksHtml = hasMarks
    ? `<img src="${STAMP_MARKER_DATA_URI}" width="270" height="90" style="width:270px;height:90px;" alt="PE stamp and signature go here" />`
    : "[PE stamp &amp; signature]";
  const header = logoDataUri
    ? `<img src="${logoDataUri}" style="max-height:80px;max-width:340px;" alt="${esc(co.name)}" />`
    : `<h1 style="font-family:Georgia,serif;font-size:30px;margin:0;">${esc(co.name)}</h1>`;

  const bySlot = {};
  for (const img of images) (bySlot[img.slot || "other"] = bySlot[img.slot || "other"] || []).push(img);
  const used = new Set();
  const photosFor = (slots) => slots.flatMap((s) => { if (used.has(s)) return []; used.add(s); return bySlot[s] || []; }).map(IMG).join("");

  const built = buildFindings(f);
  const { tagLine, findings } = built;
  const corrections = mode === "corrections" && Array.isArray(chosen) ? chosen.filter((c) => String(c || "").trim()) : built.corrections;

  const addr = esc(f.propertyAddress || "");
  const sqft = (f.sqft || "").trim();
  const homeWords = homeTypeWords(f.homeType);
  const listed = [sqft ? `${esc(sqft)} Sq-ft` : "", esc(homeWords)].filter(Boolean).join(" ");
  const dims = f.widthFt || f.lengthFt ? `${esc(f.widthFt || "?")}' x ${esc(f.lengthFt || "?")}'` : "";

  // Order matters: claim photos in the order they appear in the letter.
  const sidesHtml = photosFor(["p01"]);
  const tagsHtml = photosFor(["p03"]);
  const findingsHtml = mode === "clear"
    ? `<p style="margin:14px 0 6px;"><b>${esc(CLEAR_ORIGINAL_HEADING)}</b> (${esc(longDate(f.date))})</p>` + findings.map((x) => `<p ${P}>${esc(x.text)}</p>`).join("")
    : findings.map((x) => `<p ${P}>${esc(x.text)}</p>${photosFor(x.slots)}`).join("");

  const hh = DEFAULT_COMPANY.name;
  const nextStepsHtml = `<p style="margin:18px 0 8px;"><b>${esc(NEXT_STEPS_HEADING)}</b></p>
       <p ${P}>${esc(NEXT_STEPS_INTRO)}</p>
       <ol style="margin:0 0 12px 22px;padding:0;">${NEXT_STEPS_OPTIONS.map((o) => `<li style="margin:4px 0;">${esc(fill(o, { hh }))}</li>`).join("")}</ol>
       ${feeCents > 0 ? `<p ${P}>${esc(fill(NEXT_STEPS_FEE, { fee: money(feeCents) }))}</p>` : ""}
       <p ${P}>${esc(fill(NEXT_STEPS_CLOSE, { company: co.name, phone: co.phone || DEFAULT_COMPANY.phone }))}</p>`;

  const fu = followup || {};
  const how = fu.by === "house_and_home"
    ? `${hh} re-inspected the home${fu.date ? ` on ${longDate(fu.date)}` : ""}`
    : `The inspector submitted new photos${fu.date ? ` taken on ${longDate(fu.date)}` : ""}`;
  const clearHtml = `<p style="margin:18px 0 8px;"><b>${esc(CLEAR_DONE_HEADING)}</b></p>
       <p ${P}>${esc(fill(CLEAR_DONE_INTRO, { sent: fu.sentAt ? longDate(isoDay(fu.sentAt)) : "earlier", how }))}</p>
       ${(fu.items || []).map((it, i) => `<p style="margin:12px 0 4px;"><b>${i + 1}. ${esc(it.correction)}</b></p>${it.note ? `<p ${P}>${esc(it.note)}</p>` : ""}${(it.photos || []).map(IMG).join("")}`).join("")}
       ${(fu.extra || []).length ? `<p style="margin:12px 0 4px;"><b>Other follow-up photos</b></p>${fu.extra.map(IMG).join("")}` : ""}
       ${fu.notes ? `<p ${P}>${esc(fu.notes)}</p>` : ""}
       <p style="margin:18px 0 10px;">${esc(PASS_STATEMENT)}</p>`;

  const resultHtml = mode === "clear" ? clearHtml : corrections.length
    ? `<p style="margin:18px 0 8px;"><b>${esc(CORRECTIONS_HEADING)}</b></p>
       <ol style="margin:0 0 12px 22px;padding:0;">${corrections.map((c) => `<li style="margin:4px 0;">${esc(c)}</li>`).join("")}</ol>
       ${photosFor(["p02"])}
       <p style="margin:18px 0 8px;">${esc(CONTRACTORS_HEADING)}</p>
       <ol style="margin:0 0 12px 22px;padding:0;">${CONTRACTORS.map((c) => `<li style="margin:3px 0;">${esc(c)}</li>`).join("")}</ol>
       ${mode === "corrections" ? nextStepsHtml : ""}`
    : `<p style="margin:18px 0 10px;">${esc(PASS_STATEMENT)}</p>${photosFor(["p02"])}`;

  // Anything not placed next to a finding goes at the end.
  const leftover = (mode === "clear" ? ["sketch"] : ["p01", "p03", "p08", "p10", "other", "unsorted", "sketch", ...PHOTO_SLOTS.map((s) => s.id)])
    .filter((s, i, a) => a.indexOf(s) === i && !used.has(s) && (bySlot[s] || []).length);
  const leftoverHtml = leftover.length
    ? `<p style="margin:22px 0 8px;"><b>Additional photos</b></p>` +
      leftover.map((s) => `<p style="margin:10px 0 4px;color:#555;">${esc((bySlot[s][0] || {}).label || "")}</p>${photosFor([s])}`).join("")
    : "";

  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:Calibri,Arial,sans-serif;color:#111;font-size:12pt;max-width:700px;">

<p style="background:#fff8e1;border:1px dashed #c9a227;padding:8px 12px;color:#7a5b00;font-size:10pt;">
DRAFT generated from the inspector's submission. Review every sentence${hasMarks ? " (your stamp and signature are added to the PDF automatically when it's sent; leave the grey box)" : ", add the PE stamp and signature"}, then delete this note.</p>

${header}
${mode === "corrections" ? `<p style="margin:14px 0 0;font-size:14pt;"><b>Corrections Letter</b></p>` : mode === "clear" ? `<p style="margin:14px 0 0;font-size:14pt;"><b>Clear Letter</b></p>` : ""}

<table style="width:100%;margin:16px 0 10px;border-collapse:collapse;"><tr>
  <td style="vertical-align:top;width:52%;padding:0;">
    <p ${P}>Date of Inspection: ${esc(longDate(f.date))}</p>
    <p ${P}>Date of Re-inspection: ${mode === "clear" ? esc(longDate(fu.date || "")) : ""}</p>
    <p ${P}>Address: ${addr}</p>
  </td>
  <td style="vertical-align:top;width:48%;padding:0;">
    <p ${P}>Type of Inspection: Manufactured Home Foundation Inspection</p>
    <p ${P}>Licensed Inspector: ${esc(eng.name)} ${esc(eng.title)}</p>
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
    <p style="margin:0;">${esc(eng.name)}</p>
    <p style="margin:0;">${esc(eng.title)}</p>
    ${licenseLine ? `<p style="margin:0;">${licenseLine}</p>` : ""}
    <p style="margin:0;">${esc(co.phone || "")}</p>
    <p style="margin:0;">${esc(co.email || "")}</p>
  </td>
  <td style="vertical-align:bottom;width:40%;text-align:right;padding:0;color:#888;">${marksHtml}</td>
</tr></table>

<p style="margin-top:28px;color:#666;font-size:9pt;">${esc(DOCUMENT_ID)}</p>
</body></html>`;
}
