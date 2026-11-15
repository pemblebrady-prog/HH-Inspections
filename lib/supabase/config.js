export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
// True once the Supabase env vars are set in Vercel. Until then the portal
// keeps running without logins (handy for local dev).
export const authEnabled = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
