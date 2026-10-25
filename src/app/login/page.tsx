/**
 * Save as: src/app/login/page.tsx  (new file)
 */
import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { login, signup } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Log in" };

type SP = Record<string, string | undefined>;

export default async function LoginPage({ searchParams }: { searchParams: Promise<SP> | SP }) {
  const sp = await searchParams;
  if (await getUser()) redirect("/");

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-4xl">Log in</h1>
      <p className="ui mt-2 text-sm text-muted">Log in with your email and password to see your personal &quot;For you&quot; list.</p>

      {sp.error && <p role="alert" className="ui mt-4 rounded border border-rule p-3 text-sm text-red-700">{sp.error}</p>}
      {sp.message && <p role="status" className="ui mt-4 rounded border border-rule p-3 text-sm">{sp.message}</p>}

      <form className="ui mt-6 space-y-4">
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required autoComplete="email" className="field" />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input id="password" name="password" type="password" required minLength={8} autoComplete="current-password" className="field" />
        </div>
        <div className="flex gap-3">
          <button formAction={login} className="btn">Log in</button>
          <button formAction={signup} className="btn-quiet">Create account</button>
        </div>
      </form>
    </div>
  );
}