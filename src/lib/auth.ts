import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { env } from "./env";
import { adminDb } from "./db";

const COOKIE = "nr_token";

export async function signIn(email: string, password: string): Promise<boolean> {
  const e = env();
  const sb = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data.session) return false;
  cookies().set(COOKIE, data.session.access_token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: data.session.expires_in, path: "/" });
  return true;
}
export const signOut = () => cookies().delete(COOKIE);

/** Returns the staff member, or null. Staff = a Supabase Auth user listed in the `staff` table. */
export async function currentStaff(): Promise<{ id: string; email: string; role: "admin" | "editor" } | null> {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  const e = env();
  const sb = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data } = await sb.auth.getUser(token);
  if (!data.user) return null;
  const { data: staff } = await adminDb().from("staff").select("role").eq("user_id", data.user.id).maybeSingle();
  return staff ? { id: data.user.id, email: data.user.email ?? "", role: staff.role } : null;
}
export async function requireStaff() {
  const s = await currentStaff();
  if (!s) throw new Error("Not authorised");
  return s;
}
