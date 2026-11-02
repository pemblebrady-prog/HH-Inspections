import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Setup check: which settings the server can see (true/false only, never values).
export async function GET() {
  const has = (k) => Boolean(process.env[k] && String(process.env[k]).trim());
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  return NextResponse.json({
    environment: process.env.VERCEL_ENV || "unknown",
    branch: process.env.VERCEL_GIT_COMMIT_REF || null,
    commit: (process.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 7) || null,
    settings: {
      NEXT_PUBLIC_SUPABASE_URL: has("NEXT_PUBLIC_SUPABASE_URL"),
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: has("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
      SUPABASE_SECRET_KEY: has("SUPABASE_SECRET_KEY"),
      RESEND_API_KEY: has("RESEND_API_KEY"),
      GDRIVE_ROOT_FOLDER_ID: has("GDRIVE_ROOT_FOLDER_ID"),
    },
    supabaseUrlLooksRight: /^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(url.trim()),
    // Names of any Supabase-ish settings, to catch typos (names only).
    supabaseSettingNames: Object.keys(process.env).filter((k) => /SUPA/i.test(k)).sort(),
  });
}
