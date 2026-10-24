import { adminDb } from "./db";

/** Minimal background-job abstraction: records every run in the `jobs` table. Swap for a queue (Inngest, pg-boss) later. */
export async function runJob<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const db = adminDb();
  const { data } = await db.from("jobs").insert({ name }).select("id").single();
  try {
    const result = await fn();
    await db.from("jobs").update({ status: "done", finished_at: new Date().toISOString(), result: result as any }).eq("id", data?.id);
    return result;
  } catch (err) {
    await db.from("jobs").update({ status: "failed", finished_at: new Date().toISOString(), error: String(err) }).eq("id", data?.id);
    throw err;
  }
}
