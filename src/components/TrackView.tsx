"use client";

/**
 * Invisible component: put it on an article page and it records that the
 * visitor opened the article, and how long they stayed.
 * Save as: src/components/TrackView.tsx
 * Use:     <TrackView articleId={article.id} />
 */
import { useEffect } from "react";

function ensureVisitorCookie() {
  try {
    if (/(?:^|; )nr_vid=/.test(document.cookie)) return;
    const id = crypto.randomUUID();
    document.cookie = `nr_vid=${id}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
  } catch {
    /* cookies blocked: tracking simply doesn't happen */
  }
}

export function TrackView({ articleId }: { articleId: string }) {
  useEffect(() => {
    ensureVisitorCookie();
    const startedAt = Date.now();

    fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ articleId, type: "view" }),
      keepalive: true,
    }).catch(() => {});

    let sent = false;
    const sendRead = () => {
      if (sent) return;
      const seconds = Math.round((Date.now() - startedAt) / 1000);
      if (seconds < 10) return; // under 10s = just a glance, not a read
      sent = true;
      const data = JSON.stringify({ articleId, type: "read", dwellSeconds: seconds });
      try {
        navigator.sendBeacon("/api/events", new Blob([data], { type: "application/json" }));
      } catch {
        /* ignore */
      }
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") sendRead();
    };

    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", sendRead);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", sendRead);
      sendRead();
    };
  }, [articleId]);

  return null;
}

export default TrackView;