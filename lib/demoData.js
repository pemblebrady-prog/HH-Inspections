// Demo mode: open the portal with ?demo=1 to get a "Fill sample data" button.
// Sample photos live in /public/demo/<slotId>.jpg (plus sketch.jpg). Swap those
// files for real inspection photos any time — no code change needed. Use photos
// with no house numbers or people, since they're paired with a made-up address.

export const DEMO_REPORT = {
  date: new Date().toISOString().slice(0, 10),
  propertyAddress: "123 Sample Ridge Rd, Tucson, AZ 85750",
  inspectorName: "Demo Inspector",
  clientName: "Sample Client",
  sendReportTo: "demo@example.com", // receipts are never sent in demo mode
  ageOfHome: "1998",
  lengthFt: "64",
  widthFt: "28",
  inspectionType: "FHA",
  frontFaces: "South",
  rain3: "No",
  homeType: "Double-Wide",
  attached: "Yes",
  certTags: "Yes",
  tieDowns: "Present",
  skirting: ["Concrete Block Wall"],
  venting: ["Venting Through Skirting"],
  framing: ["Metal I-Beam", "Wood Joists"],
  piers: ["Concrete Blocks"],
  insulation: ["Batt Fiberglass"],
  moisture: ["Plastic Sheeting"],
  grading: "Adequate",
  piersCondition: "Functional",
  skirtingCondition: "Functional",
  axles: "Axles Still Attached",
  sqft: "1,792",
  hudTagNumbers: "ARZ 000001, ARZ 000002",
  tieDownsPerSide: "8",
  crawlAccess: "through the concrete block skirting, east side",
  generalComments: "Covered porch attached on the south side. Crawlspace accessed through the east skirting.",
};

export function isDemoUrl() {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("demo") === "1";
}

// Fetch a sample photo from /public/demo and wrap it as a File, so it flows
// through the exact same upload path as a real photo.
export async function loadDemoPhoto(name) {
  const res = await fetch(`/demo/${name}.jpg`);
  if (!res.ok) throw new Error(`Missing demo photo: ${name}.jpg`);
  const blob = await res.blob();
  const file = new File([blob], `${name}.jpg`, { type: "image/jpeg" });
  return { file, url: URL.createObjectURL(file) };
}
