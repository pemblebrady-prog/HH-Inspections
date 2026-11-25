export const FEE = process.env.NEXT_PUBLIC_CERT_FEE || "135";

export const SINGLE = [
  { id: "inspectionType", label: "Type of Inspection", opts: ["HUD", "VA", "Porches & Additions", "FHA", "Conventional", "Cash", "USDA", "Unknown"] },
  { id: "frontFaces", label: "Front of House Faces", opts: ["North", "South", "East", "West", "Northwest", "Northeast", "Southwest", "Southeast"] },
  { id: "rain3", label: "Rain in the Last 3 Days?", opts: ["Yes", "No", "Unknown"] },
  { id: "homeType", label: "Home Type", opts: ["Single-Wide", "Double-Wide", "Triple-Wide", "Unknown"] },
  { id: "certTags", label: "Certification Tags", opts: ["Yes", "No", "Not Visible", "Covered", "Yes, but Illegible"] },
  { id: "tieDowns", label: "Tie Downs", opts: ["Present", "Not Present", "Not Visible", "Present but Inadequate"] },
  { id: "homeSet", label: "Home Set", opts: ["Ground Set", "Pit Set"] }, // Nov 24
  { id: "grading", label: "Grading & Drainage", opts: ["Adequate", "Inadequate", "Not Visible"] },
  { id: "piersCondition", label: "Piers Condition", opts: ["Functional", "Deficient", "Not Visible"] },
  // Skirting and venting are separate questions (Nov 24; older jobs have one "Skirting & Venting Condition").
  { id: "skirtingCondition", label: "Skirting Condition", opts: ["Functional", "Deficient", "No Skirting"] },
  { id: "ventingCondition", label: "Venting Condition", opts: ["Adequate", "Inadequate", "No Venting"] },
  { id: "axles", label: "Axles / Hitch", opts: ["Removed", "Axles Still Attached", "Hitch Still Attached", "Axles and Hitch Still Attached", "Not Visible"] },
  // Shown on the job page for the engineer; not used in the letter (Brian, Nov 19).
  { id: "homeMoved", label: "Has the home ever been moved?", opts: ["No", "Yes", "Unknown"] },
  // Asked on the skirting/venting/framing step (moved from Conditions, Nov 24). Older jobs: Yes / No / Unknown.
  { id: "attached", label: "Attached Structures", opts: ["Self-Supporting", "Not Self-Supporting", "Not Applicable (no attached structures)"] },
];

// Free-text details used in the certification letter.
export const DETAILS = [
  { id: "sqft", label: "Square footage", placeholder: "e.g. 1,154", inputMode: "numeric" },
  { id: "tieDownsPerSide", label: "Tie-downs per side", placeholder: "e.g. 10", inputMode: "numeric" },
  { id: "crawlAccess", label: "Crawlspace access location", placeholder: "e.g. through the concrete block skirting, east side" },
];

export const MULTI = [
  { id: "skirting", label: "Skirting Type", opts: ["Concrete Block Wall", "Slump Block Wall", "Vinyl/Plastic", "Metal", "Treated Wood", "Non-Treated Wood", "Brick", "Masonry", "Rock and Mortar", "Rebar-Backed", "Metal Backing", "Concrete Board", "Foam", "No Skirting"] },
  { id: "venting", label: "Crawlspace Venting", opts: ["Venting Through Skirting", "Masonry Vents", "Venting Through Crawl Access Point(s)", "In-Ground Vents", "Inadequate Venting", "No Venting"] },
  { id: "framing", label: "Framing", opts: ["Metal I-Beam", "Wood Joists", "Metal Joists", "Wood Sub-Floor", "Unknown"] },
  { id: "piers", label: "Piers / Supports", opts: ["Concrete Blocks", "Metal Jacks", "Wood", "Concrete Pillars", "Shims", "Unknown"] },
  { id: "insulation", label: "Insulation", opts: ["Batt Fiberglass", "Blown-In Fiberglass", "Blow-In Cellulose", "Spray Foam", "Rigid Foam", "Damaged", "None Present", "Not Visible", "Unknown"] },
  { id: "moisture", label: "Moisture Barrier (Belly Wrap)", opts: ["Plastic Sheeting", "Fiberboard", "Damaged", "None Present", "Not Visible", "Unknown"] },
];

// Photos are uploaded in one batch, not sorted (Nov 24). They arrive as "unsorted"; the engineer moves them
// into these sections on the review screen, and the letter places each section's photos by its finding.
export const UNSORTED = { id: "unsorted", n: "00", label: "Photos" };
export const PHOTO_SLOTS = [
  { id: "p01", n: "01", label: "All four sides of home" },
  { id: "p02", n: "02", label: "Deficiencies / possible deficiencies" },
  { id: "p03", n: "03", label: "Certification tags (if present)" },
  { id: "p04", n: "04", label: "Grading and drainage" },
  { id: "p05", n: "05", label: "Attached structures" },
  { id: "p06", n: "06", label: "Framing (piers and beams)" },
  { id: "p07", n: "07", label: "Tie downs (if present)" },
  { id: "p08", n: "08", label: "Moisture barrier (belly wrap)" },
  { id: "p09", n: "09", label: "Venting" },
  { id: "p10", n: "10", label: "Insulation (if visible)" },
  { id: "p11", n: "11", label: "Skirting (outside + from inside crawlspace)" },
  { id: "other", n: "12", label: "Other pictures" },
];

// Resize an uploaded logo to a sane letterhead size (preserving aspect ratio,
// flattening any transparency onto white) so it's already well-behaved before
// it ever reaches Drive or gets embedded in a generated letter.
export async function normalizeLogo(file, maxW = 480, maxH = 160) {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxW / bitmap.width, maxH / bitmap.height);
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);              // flatten transparency onto white
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
    return blob ? new File([blob], "logo.png", { type: "image/png" }) : file;
  } catch { return file; }
}
// Resize photos client-side so uploads are fast and safely under Vercel's limit.
export async function compress(file, maxDim = 1600, quality = 0.7) {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    canvas.getContext("2d").drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", quality));
    return blob ? new File([blob], "img.jpg", { type: "image/jpeg" }) : file;
  } catch { return file; }
}

// Homes built before June 15, 1976 (the HUD code) or under 400 sq ft can't be HUD certified.
// Returns the reasons that apply, or [] (Brian, Nov 19).
export function hudProblems(f) {
  const out = [];
  const raw = String((f && f.ageOfHome) || "").trim();
  const n = Number((raw.match(/\d{1,4}/) || [])[0]);
  let year = null;
  if (n >= 1900 && n <= 2100) year = n;
  else if (n > 0 && n < 150 && /yr|year|old|age/i.test(raw)) year = new Date().getFullYear() - n;
  if (year && year < 1976) out.push(`built in ${year}, before the HUD code (June 15, 1976)`);
  else if (year === 1976) out.push("built in 1976: homes built before June 15, 1976 can't be HUD certified");
  let sq = Number(String((f && f.sqft) || "").replace(/[^\d.]/g, ""));
  if (!sq) { const L = Number(f && f.lengthFt), W = Number(f && f.widthFt); if (L > 0 && W > 0) sq = L * W; }
  if (sq > 0 && sq < 400) out.push(`${Math.round(sq)} sq ft, under the 400 sq ft minimum`);
  return out;
}
