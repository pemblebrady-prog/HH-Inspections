import { requireUser } from "../../../../lib/supabase/server";
import { getDrive } from "../../../../lib/drive";

export const runtime = "nodejs";

// Admins: stream a job photo from Drive so it can be shown on the review page.
export async function GET(req) {
  const auth = await requireUser(["admin"]);
  if (auth.error) return auth.error;
  const id = new URL(req.url).searchParams.get("id");
  const drive = getDrive();
  if (!id || !/^[\w-]+$/.test(id) || !drive) return new Response("Not found", { status: 404 });
  try {
    const meta = await drive.files.get({ fileId: id, fields: "mimeType", supportsAllDrives: true });
    const mime = meta.data.mimeType || "image/jpeg";
    if (!mime.startsWith("image/")) return new Response("Not an image", { status: 400 });
    const res = await drive.files.get({ fileId: id, alt: "media", supportsAllDrives: true }, { responseType: "arraybuffer" });
    return new Response(Buffer.from(res.data), { headers: { "Content-Type": mime, "Cache-Control": "private, max-age=3600" } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
