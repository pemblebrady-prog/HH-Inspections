// iPhone photos saved as HEIC: Safari can read them, but Chrome, Edge and Firefox on a computer can't.
// When a HEIC photo can't be read here, convert it to JPEG with heic2any (loaded only when needed).

const HEIC2ANY = "https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js";

export const isHeic = (file) => /hei[cf]/i.test(file.type || "") || /\.hei[cf]$/i.test(file.name || "");
// Photos only: some computers give HEIC files no type, so go by the name too.
export const isPhotoFile = (file) => (file.type || "").startsWith("image/") || isHeic(file);

let loading = null;
function loadConverter() {
  if (typeof window === "undefined") return Promise.reject(new Error("No window"));
  if (window.heic2any) return Promise.resolve(window.heic2any);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = HEIC2ANY; s.async = true;
      s.onload = () => (window.heic2any ? resolve(window.heic2any) : reject(new Error("Converter didn't load")));
      s.onerror = () => { loading = null; reject(new Error("Couldn't load the HEIC converter")); };
      document.head.appendChild(s);
    });
  }
  return loading;
}

// Returns a file the browser can draw (the same file when it already can).
export async function readablePhoto(file) {
  if (!isHeic(file)) return file;
  try { const b = await createImageBitmap(file); if (b && b.close) b.close(); return file; } catch { /* not readable here */ }
  try {
    const heic2any = await loadConverter();
    const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.88 });
    const blob = Array.isArray(out) ? out[0] : out;
    return new File([blob], (file.name || "photo").replace(/\.hei[cf]$/i, "") + ".jpg", { type: "image/jpeg" });
  } catch { return file; } // upload as-is; the office can still open it from Drive
}
