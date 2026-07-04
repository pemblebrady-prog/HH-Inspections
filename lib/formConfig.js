export const FEE = process.env.NEXT_PUBLIC_CERT_FEE || "135";

export const SINGLE = [
  { id: "inspectionType", label: "Type of Inspection", opts: ["HUD", "VA", "Porches & Additions", "FHA", "Conventional", "Cash", "USDA", "Unknown"] },
  { id: "frontFaces", label: "Front of House Faces", opts: ["North", "South", "East", "West", "Northwest", "Northeast", "Southwest", "Southeast"] },
  { id: "rain3", label: "Rain in the Last 3 Days?", opts: ["Yes", "No", "Unknown"] },
  { id: "homeType", label: "Home Type", opts: ["Single-Wide", "Double-Wide", "Triple-Wide", "Unknown"] },
  { id: "attached", label: "Attached Structures", opts: ["Yes", "No", "Unknown"] },
  { id: "certTags", label: "Certification Tags", opts: ["Yes", "No", "Not Visible", "Covered", "Yes, but Illegible"] },
  { id: "tieDowns", label: "Tie Downs", opts: ["Present", "Not Present", "Not Visible", "Present but Inadequate"] },
];

export const MULTI = [
  { id: "skirting", label: "Skirting Type", opts: ["Concrete Block Wall", "Slump Block Wall", "Vinyl/Plastic", "Metal", "Wood", "Brick", "Masonry", "Concrete Board", "Foam", "No Skirting"] },
  { id: "venting", label: "Crawlspace Venting", opts: ["Venting Through Skirting", "Masonry Vents", "Venting Through Crawl Access Point(s)", "Inadequate Venting", "No Venting"] },
  { id: "framing", label: "Framing", opts: ["Metal I-Beam", "Wood Joists", "Metal Joists", "Wood Sub-Floor", "Unknown"] },
  { id: "piers", label: "Piers / Supports", opts: ["Concrete Blocks", "Metal Jacks", "Wood", "Concrete Pillars", "Unknown"] },
  { id: "insulation", label: "Insulation", opts: ["Batt Fiberglass", "Blown-In Fiberglass", "Blow-In Cellulose", "Spray Foam", "Rigid Foam", "None Present", "Not Visible", "Unknown"] },
  { id: "moisture", label: "Moisture Barrier (Belly Wrap)", opts: ["Plastic Sheeting", "Fiberboard", "None Present", "Not Visible", "Unknown"] },
];

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
