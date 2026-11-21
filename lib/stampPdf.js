import { PDFDocument, PDFName, PDFArray, PDFDict, PDFNumber, PDFRawStream, decodePDFRawStream, rgb } from "pdf-lib";
import { STAMP_MARKER_W, STAMP_MARKER_H } from "./stampMarker";

// Put the engineer's stamp and signature on the final PDF, where the draft letter's grey
// "PE stamp & signature" box is (see lib/stampMarker.js). Finds that box by walking the PDF's
// drawing commands for images shaped like it (3:1), takes the last one in the letter, covers it
// in white and draws the real images over it. Returns { pdf, placed }; if the box isn't there
// (deleted, or the letter was stamped by hand) the PDF comes back unchanged.
//
// stamp / signature: Buffers of PNG or JPEG images (either may be null).
export async function stampPdf(pdfBytes, { stamp, signature }) {
  if (!stamp && !signature) return { pdf: pdfBytes, placed: false, reason: "no images" };
  const doc = await PDFDocument.load(pdfBytes, { updateMetadata: false });
  const pages = doc.getPages();
  let target = null;
  pages.forEach((page, i) => {
    for (const r of imagePlacements(doc, page)) if (looksLikeMarker(r)) target = { ...r, page: i };
  });
  if (!target) return { pdf: pdfBytes, placed: false, reason: "box not found" };

  const page = pages[target.page];
  const embed = async (buf) => {
    if (!buf) return null;
    if (buf[0] === 0x89 && buf[1] === 0x50) return doc.embedPng(buf);
    if (buf[0] === 0xff && buf[1] === 0xd8) return doc.embedJpg(buf);
    return null; // other formats aren't supported in PDFs
  };
  const [stampImg, sigImg] = await Promise.all([embed(stamp), embed(signature)]);
  if (!stampImg && !sigImg) return { pdf: pdfBytes, placed: false, reason: "images must be PNG or JPG" };

  const { x, y, w, h } = target;
  page.drawRectangle({ x: x - 1, y: y - 1, width: w + 2, height: h + 2, color: rgb(1, 1, 1) });
  const right = x + w;
  let cursor = right;
  if (stampImg) {
    // The stamp sits at the right, a bit taller than the box (there's open space above it).
    const sh = h * 1.35, sw = sh * (stampImg.width / stampImg.height);
    const s = sw > w * 0.6 ? (w * 0.6) / sw : 1;
    page.drawImage(stampImg, { x: right - sw * s, y, width: sw * s, height: sh * s });
    cursor = right - sw * s - 6;
  }
  if (sigImg) {
    const room = cursor - x;
    let gh = h * 0.7, gw = gh * (sigImg.width / sigImg.height);
    if (gw > room) { gw = room; gh = gw * (sigImg.height / sigImg.width); }
    page.drawImage(sigImg, { x: cursor - gw, y: y + 2, width: gw, height: gh });
  }
  return { pdf: Buffer.from(await doc.save()), placed: true };
}

function looksLikeMarker(r) {
  if (!(r.w > 40 && r.h > 10)) return false;
  const want = STAMP_MARKER_W / STAMP_MARKER_H;
  const drawn = r.w / r.h, pixels = r.pw && r.ph ? r.pw / r.ph : drawn;
  return Math.abs(drawn - want) / want < 0.06 && Math.abs(pixels - want) / want < 0.06;
}

// ---- Find where each image is drawn on a page: [{ x, y, w, h, pw, ph }] in PDF points. ----
function imagePlacements(doc, page) {
  const out = [];
  const contents = page.node.Contents();
  const streams = contents instanceof PDFArray ? contents.asArray().map((r) => doc.context.lookup(r)) : [contents];
  const bytes = streams.filter(Boolean).map(streamBytes).filter(Boolean);
  const all = Buffer.concat(bytes.flatMap((b) => [Buffer.from(b), Buffer.from("\n")]));
  walk(doc, all, page.node.Resources(), [1, 0, 0, 1, 0, 0], out, 0);
  return out;
}

function streamBytes(s) {
  try { return s instanceof PDFRawStream ? decodePDFRawStream(s).decode() : s.getContents ? s.getContents() : null; }
  catch { return null; }
}

const mul = (m, n) => [ // m then n (PDF: CTM' = m × CTM)
  m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3],
  m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3],
  m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5],
];

function walk(doc, bytes, resources, start, out, depth) {
  if (depth > 6) return;
  const xobjects = resources && resources.lookup(PDFName.of("XObject"));
  let ctm = start; const stack = []; let ops = [];
  for (const tok of lex(bytes)) {
    if (tok.t === "num" || tok.t === "name") { ops.push(tok); continue; }
    if (tok.t !== "op") { ops.push(tok); continue; }
    const op = tok.v;
    if (op === "q") stack.push(ctm);
    else if (op === "Q") ctm = stack.pop() || start;
    else if (op === "cm") {
      const n = ops.slice(-6).map((o) => o.v);
      if (n.length === 6 && n.every((v) => typeof v === "number")) ctm = mul(n, ctm);
    } else if (op === "Do") {
      const name = ops.length && ops[ops.length - 1].t === "name" ? ops[ops.length - 1].v : null;
      const xo = name && xobjects instanceof PDFDict ? doc.context.lookup(xobjects.get(PDFName.of(name))) : null;
      const dict = xo && xo.dict;
      const sub = dict && dict.get(PDFName.of("Subtype"));
      if (sub && sub.toString() === "/Image") {
        const num = (k) => { const v = dict.get(PDFName.of(k)); return v instanceof PDFNumber ? v.asNumber() : null; };
        // The unit square through the CTM (no rotation in exported letters).
        const x0 = ctm[4], y0 = ctm[5], x1 = ctm[0] + ctm[4], y1 = ctm[3] + ctm[5];
        out.push({ x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(ctm[0]), h: Math.abs(ctm[3]), pw: num("Width"), ph: num("Height") });
      } else if (sub && sub.toString() === "/Form") {
        const mArr = dict.lookup(PDFName.of("Matrix"));
        const m = mArr instanceof PDFArray ? mArr.asArray().map((v) => (v instanceof PDFNumber ? v.asNumber() : 0)) : [1, 0, 0, 1, 0, 0];
        const inner = streamBytes(xo);
        const res = dict.lookup(PDFName.of("Resources")) || resources;
        if (inner) walk(doc, Buffer.from(inner), res, mul(m, ctm), out, depth + 1);
      }
    }
    ops = [];
  }
}

// A small PDF content-stream lexer: numbers, names and operators; strings, arrays and dicts skipped.
function* lex(b) {
  const n = b.length; let i = 0;
  const ws = (c) => c === 0x20 || c === 0x0a || c === 0x0d || c === 0x09 || c === 0x0c || c === 0x00;
  const delim = (c) => c === 0x28 || c === 0x29 || c === 0x3c || c === 0x3e || c === 0x5b || c === 0x5d || c === 0x7b || c === 0x7d || c === 0x2f || c === 0x25;
  while (i < n) {
    const c = b[i];
    if (ws(c)) { i++; continue; }
    if (c === 0x25) { while (i < n && b[i] !== 0x0a && b[i] !== 0x0d) i++; continue; } // % comment
    if (c === 0x28) { // (literal string)
      let depth = 1; i++;
      while (i < n && depth) { if (b[i] === 0x5c) i += 2; else { if (b[i] === 0x28) depth++; else if (b[i] === 0x29) depth--; i++; } }
      yield { t: "str" }; continue;
    }
    if (c === 0x3c && b[i + 1] === 0x3c) { i += 2; yield { t: "dict" }; continue; }
    if (c === 0x3e && b[i + 1] === 0x3e) { i += 2; continue; }
    if (c === 0x3c) { while (i < n && b[i] !== 0x3e) i++; i++; yield { t: "str" }; continue; } // <hex>
    if (c === 0x5b || c === 0x5d || c === 0x7b || c === 0x7d) { i++; yield { t: "arr" }; continue; }
    if (c === 0x2f) { let j = i + 1; while (j < n && !ws(b[j]) && !delim(b[j])) j++; yield { t: "name", v: b.slice(i + 1, j).toString("latin1") }; i = j; continue; }
    let j = i; while (j < n && !ws(b[j]) && !delim(b[j])) j++;
    if (j === i) { i++; continue; }
    const word = b.slice(i, j).toString("latin1"); i = j;
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(word)) { yield { t: "num", v: parseFloat(word) }; continue; }
    if (word === "BI") { // inline image: skip to EI
      const end = b.indexOf("EI", i, "latin1"); i = end < 0 ? n : end + 2; continue;
    }
    yield { t: "op", v: word };
  }
}
