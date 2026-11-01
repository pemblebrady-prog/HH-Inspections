import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import { authEnabled } from "../../../lib/supabase/config";

export async function POST(request) {
  if (authEnabled) await createClient().auth.signOut();
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
