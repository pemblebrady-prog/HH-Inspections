// On-the-phone photo quality check (free, works offline): too dark? blurry?
// Gentle hints only — thresholds are deliberately forgiving.

export async function photoQuality(file) {
  try {
    const bmp = await createImageBitmap(file);
    const W = 256, scale = W / Math.max(bmp.width, bmp.height);
    const w = Math.max(16, Math.round(bmp.width * scale)), h = Math.max(16, Math.round(bmp.height * scale));
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(bmp, 0, 0, w, h);
    return measure(ctx.getImageData(0, 0, w, h).data, w, h);
  } catch { return null; }
}

// Pure math (testable): mean brightness and variance of the Laplacian (sharpness).
export function measure(rgba, w, h) {
  const g = new Float32Array(w * h);
  let sum = 0;
  for (let i = 0; i < w * h; i++) { const v = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]; g[i] = v; sum += v; }
  const brightness = sum / (w * h);
  let n = 0, m = 0, m2 = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const lap = g[i - w] + g[i + w] + g[i - 1] + g[i + 1] - 4 * g[i];
    n++; const d = lap - m; m += d / n; m2 += d * (lap - m);
  }
  const sharpness = n ? m2 / n : 0;
  return { brightness: Math.round(brightness), sharpness: Math.round(sharpness), dark: brightness < 40, blurry: brightness >= 40 && sharpness < 25 };
}
