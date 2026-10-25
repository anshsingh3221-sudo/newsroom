"use server";
/**
 * Save as: src/app/login/actions.ts  (new file; create the folder src/app/login)
 */
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

function back(kind: "error" | "message", text: string): never {
  redirect(`/login?${kind}=${encodeURIComponent(text)}`);
}

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) back("error", "Enter your email and password.");
  const sb = await supabaseServer();
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) back("error", "Wrong email or password, or the email is not confirmed yet.");
  redirect("/");
}

export async function signup(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email) back("error", "Enter your email.");
  if (password.length < 8) back("error", "Use a password of at least 8 characters.");
  const sb = await supabaseServer();
  const { data, error } = await sb.auth.signUp({ email, password });
  if (error) back("error", error.message);
  if (data.session) redirect("/");
  back("message", "Account created. Check your email to confirm it, then log in.");
}

export async function logout() {
  const sb = await supabaseServer();
  await sb.auth.signOut();
  redirect("/");
}