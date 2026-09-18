"use client";

import { useEffect, useState } from "react";

/** Current time, re-rendered every `intervalMs`. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

const pad = (v: number) => String(v).padStart(2, "0");

/** "2 j 04:12:09" until `end`, or null once it has passed. */
export function formatRemaining(end: number, now: number): string | null {
  const ms = end - now;
  if (ms <= 0) return null;
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${d > 0 ? `${d} j ` : ""}${pad(h)}:${pad(m)}:${pad(sec)}`;
}

/**
 * Live countdown to the end of an owner's free trial, with a bar showing how
 * much of the trial is used. Red in the last 24 hours, then "Expiré".
 */
export default function TrialCountdown({
  start, end, compact = false,
}: {
  start: string | number;
  end: string | number;
  compact?: boolean;
}) {
  const now = useNow();
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  const remaining = formatRemaining(e, now);
  const used = Math.min(Math.max((now - s) / Math.max(e - s, 1), 0), 1);
  const urgent = remaining !== null && e - now < 24 * 3600 * 1000;
  const tone = remaining === null ? "text-danger" : urgent ? "text-danger" : used > 0.6 ? "text-warning" : "text-success";
  const bar = remaining === null ? "bg-danger" : urgent ? "bg-danger" : used > 0.6 ? "bg-warning" : "bg-success";

  return (
    <div className={compact ? "min-w-[120px]" : "min-w-[180px]"}>
      <p className={`font-semibold tabular-nums ${compact ? "text-[12.5px]" : "text-[20px] leading-tight"} ${tone}`}>
        {remaining ?? "Expiré"}
      </p>
      <div className={`mt-1.5 rounded-full bg-line/60 overflow-hidden ${compact ? "h-1" : "h-1.5"}`}>
        <div className={`h-full rounded-full ${bar} transition-[width] duration-1000`} style={{ width: `${used * 100}%` }} />
      </div>
    </div>
  );
}
