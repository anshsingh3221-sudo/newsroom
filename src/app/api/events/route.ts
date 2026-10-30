/**
 * Receives "the visitor opened / read / liked this article" signals.
 * Save as: src/app/api/events/route.ts
 *
 * The visitor is identified by the nr_vid cookie that TrackView sets.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

const TYPES = new Set(["view", "read", "like", "save", "share", "skip"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  let body: { articleId?: unknown; type?: unknown; dwellSeconds?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const jar = await cookies();
  const visitorId = jar.get("nr_vid")?.value;
  if (!visitorId || !UUID.test(visitorId)) {
    return NextResponse.json({ error: "Missing visitor id" }, { status: 400 });
  }

  const { articleId, type, dwellSeconds } = body;
  if (typeof articleId !== "string" || !UUID.test(articleId)) {
    return NextResponse.json({ error: "Invalid articleId" }, { status: 400 });
  }
  if (typeof type !== "string" || !TYPES.has(type)) {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }
  const dwell =
    typeof dwellSeconds === "number" && Number.isFinite(dwellSeconds)
      ? Math.min(Math.max(Math.round(dwellSeconds), 0), 3600)
      : null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }
  const db = createClient(url, key, { auth: { persistSession: false } });

  const { error } = await db.from("user_events").insert({
    user_id: visitorId,
    article_id: articleId,
    type,
    dwell_seconds: dwell,
  });
  if (error) {
    return NextResponse.json({ error: "Could not save event" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}