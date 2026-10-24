import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { discoverNews } from "@/lib/ai/discover";
import { runJob } from "@/lib/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = env().CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await runJob("ingest-feeds", discoverNews));
}
