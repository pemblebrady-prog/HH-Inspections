// Reject if a promise takes longer than ms, so callers can report a real error
// instead of hanging forever.
export function withTimeout(promise, ms, label = "Request") {
  let t;
  const timer = new Promise((_, reject) => { t = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms); });
  return Promise.race([promise, timer]).finally(() => clearTimeout(t));
}
