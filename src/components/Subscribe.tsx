"use client";

import { useState } from "react";

type Status = "idle" | "loading" | "success" | "error";

export function Subscribe({
  endpoint = "/api/subscribe",
  heading = "Get the newsroom in your inbox",
  blurb = "New stories, delivered when they publish. No spam, unsubscribe anytime.",
}: {
  endpoint?: string;
  heading?: string;
  blurb?: string;
}) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "loading") return;
    setStatus("loading");
    setMessage("");
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Something went wrong. Please try again.");
      }
      setStatus("success");
      setMessage("You're subscribed. Check your inbox to confirm.");
      setEmail("");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  return (
    <section className="my-8 border border-rule p-5">
      <h2 className="text-lg font-semibold">{heading}</h2>
      <p className="ui mt-1 text-sm text-muted">{blurb}</p>

      <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <label htmlFor="subscribe-email" className="sr-only">
          Email address
        </label>
        <input
          id="subscribe-email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={status === "loading"}
          className="ui w-full flex-1 border border-rule bg-transparent px-3 py-2 text-sm outline-none focus:border-current"
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className="ui border border-rule px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {status === "loading" ? "Subscribing…" : "Subscribe"}
        </button>
      </form>

      {message && (
        <p
          role="status"
          className={`ui mt-2 text-xs ${status === "error" ? "text-red-600" : "text-muted"}`}
        >
          {message}
        </p>
      )}
    </section>
  );
}

// Exported both ways so `import Subscribe from ...` and `import { Subscribe } from ...` both work.
export default Subscribe;