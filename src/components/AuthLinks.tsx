/**
 * Save as: src/components/AuthLinks.tsx  (new file)
 * Put <AuthLinks /> inside your Header (src/components/Shell.tsx), next to the search box.
 */
import Link from "next/link";
import { getUser } from "@/lib/supabase/server";
import { logout } from "@/app/login/actions";

export default async function AuthLinks() {
  const user = await getUser();
  if (!user) return <Link href="/login" className="ui text-sm font-medium underline">Log in</Link>;
  return (
    <form action={logout} className="ui flex items-center gap-3 text-sm">
      <span className="hidden text-muted sm:inline">{user.email}</span>
      <button className="btn-quiet">Log out</button>
    </form>
  );
}