"use client";
import { useFormState, useFormStatus } from "react-dom";
import type { ActionResult } from "@/app/admin/actions";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <button className="btn" disabled={pending}>{pending ? "Working… this can take a minute" : label}</button>;
}

export function ActionForm({ action, label, children }: {
  action: (s: ActionResult | null, f: FormData) => Promise<ActionResult>; label: string; children?: React.ReactNode;
}) {
  const [state, run] = useFormState(action, null);
  return (
    <form action={run} className="space-y-3">
      {children}
      <Submit label={label} />
      {state && <p role="status" className={`ui text-sm ${state.ok ? "text-[#1F5C42]" : "text-burgundy"}`}>{state.message}</p>}
    </form>
  );
}
