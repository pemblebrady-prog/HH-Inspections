export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
// True once the Supabase env vars are set in Vercel. Until then the portal
// keeps running without logins (handy for local dev).
export const authEnabled = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);

// Sign-in cookie: stays for 90 days on the device (renewed whenever the portal is used),
// so inspectors aren't signed out between jobs or when the phone is locked.
export const SESSION_DAYS = 90;
export const COOKIE_OPTIONS = { maxAge: SESSION_DAYS * 24 * 60 * 60, sameSite: "lax", path: "/" };
