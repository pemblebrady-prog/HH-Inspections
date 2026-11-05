import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import { authEnabled } from "../../../lib/supabase/config";

export async function POST(request) {
  if (authEnabled) await createClient().auth.signOut();
  const res = NextResponse.redirect(new URL("/login", request.url), { status: 303 });
  res.cookies.set("hh_view_as", "", { path: "/", maxAge: 0 }); // end any "View as" preview
  return res;
}
