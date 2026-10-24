"use client";
import { useEffect, useRef, useState } from "react";
import { autopilotAction } from "./actions";

const EVERY_MS = 5 * 60 * 1000; // use 6 * 60 * 1000 for 6 minutes

export function AutoRunner() {
  const [on, setOn] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const busy = useRef(false);

  useEffect(() => { setOn(localStorage.getItem("autopilot-auto") === "1"); }, []);

  useEffect(() => {
    if (!on) return;
    const tick = async () => {
      if (busy.current) return; // never run two at once
      busy.current = true;
      let text: string;
      try { const r = await autopilotAction(); text = (r.ok ? "" : "Error: ") + r.message; }
      catch (e) { text = "Error: " + (e instanceof Error ? e.message : String(e)); }
      busy.current = false;
      setLines((l) => [`${new Date().toLocaleTimeString("en-IN")} · ${text}`, ...l].slice(0, 8));
    };
    tick();
    const id = setInterval(tick, EVERY_MS);
    return () => clearInterval(id);
  }, [on]);

  const toggle = () => { const v = !on; setOn(v); localStorage.setItem("autopilot-auto", v ? "1" : "0"); };

  return (
    <div className="ui mt-4 border border-rule bg-white p-4">
      <button onClick={toggle} className={on ? "btn" : "btn-quiet"}>
        {on ? "Auto-run: ON (every 5 min). Click to stop" : "Auto-run: OFF. Click to start"}
      </button>
      <p className="mt-2 text-xs text-muted">Keep this page open. It runs autopilot now, then every 5 minutes.</p>
      <ul className="mt-2 space-y-1 text-xs">{lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
    </div>
  );
}