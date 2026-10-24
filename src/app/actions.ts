"use server";
import { z } from "zod";
import { adminDb } from "@/lib/db";

export async function subscribeAction(_: { ok: boolean; message: string } | null, f: FormData) {
  const email = z.string().email().safeParse(String(f.get("email") ?? "").trim());
  if (!email.success) return { ok: false, message: "Enter a valid email address." };
  const { error } = await adminDb().from("newsletter_subscribers").upsert({ email: email.data }, { onConflict: "email" });
  return error ? { ok: false, message: "Could not subscribe right now. Try again later." } : { ok: true, message: "You are subscribed." };
}
