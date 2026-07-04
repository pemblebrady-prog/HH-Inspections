import { NextResponse } from "next/server";
import { getOAuthClientForSetup } from "../../../../lib/drive";

export const runtime = "nodejs";

// Visit /api/google/auth once (locally) to authorize the app to your Drive.
export async function GET() {
  const client = getOAuthClientForSetup();
  if (!client) {
    return NextResponse.json(
      { error: "Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET in .env.local first." },
      { status: 400 }
    );
  }
  const url = client.generateAuthUrl({
    access_type: "offline",       // ask for a refresh token
    prompt: "consent",            // force it to return the refresh token
    scope: ["https://www.googleapis.com/auth/drive.file"], // only files this app creates
  });
  return NextResponse.redirect(url);
}
