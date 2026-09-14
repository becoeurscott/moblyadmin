import type { ReactNode } from "react";

/**
 * Overview stat tile: label + big number, an icon in the corner, and an
 * optional trend line ("+12 · 30 derniers jours") or an arbitrary `aside`
 * (e.g. a donut with its legend) rendered to the right of the value.
 */

type Tone = "primary" | "accent" | "success" | "danger" | "warning" | "neutral";

const TONE: Record<Tone, string> = {
  primary: "bg-primary-light text-primary-text",
  accent: "bg-accent/12 text-accent",
  success: "bg-success/12 text-success",
  danger: "bg-danger/12 text-danger",
  warning: "bg-warning/15 text-warning",
  neutral: "bg-line/60 text-muted",
};

export interface StatCardProps {
  label: string;
  value: string | number;
  /** e.g. "+42" — rendered with an up/down arrow when it starts with +/-. */
  delta?: string;
  deltaLabel?: string;
  /** Kept for callers on the older API: colours the delta pill. */
  accent?: Tone;
  icon?: ReactNode;
  tone?: Tone;
  aside?: ReactNode;
  /** Full-width row under the value/aside — e.g. a donut legend. */
  footer?: ReactNode;
  /** Tighter padding + smaller type for secondary tiles. */
  compact?: boolean;
  className?: string;
}

const fmt = (v: string | number) =>
  typeof v === "number" ? v.toLocaleString("fr-FR") : v;

export default function StatCard({
  label,
  value,
  delta,
  deltaLabel = "30 derniers jours",
  accent,
  icon,
  tone,
  aside,
  footer,
  compact = false,
  className = "",
}: StatCardProps) {
  const t: Tone = tone ?? accent ?? "primary";
  const dir = delta?.startsWith("-") ? "down" : delta?.startsWith("+") ? "up" : null;
  const deltaTone = dir === "down" ? "text-danger" : dir === "up" ? "text-success" : "text-muted";

  return (
    <div className={`bg-card rounded-2xl border border-line ${compact ? "p-4" : "p-5"} shadow-[var(--shadow-card)] ${className}`}>
      <div className="flex gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <p className={`${compact ? "text-[12px]" : "text-[13px]"} font-medium text-muted`}>{label}</p>
          {icon && (
            <span className={`${compact ? "w-7 h-7" : "w-8 h-8"} rounded-lg grid place-items-center shrink-0 ${TONE[t]}`}>
              {icon}
            </span>
          )}
        </div>

        <p className={`${compact ? "text-[22px] mt-2" : "text-[28px] mt-3"} leading-none font-bold text-fg tabular-nums`}>
          {fmt(value)}
        </p>

        {delta !== undefined ? (
          <p className={`mt-2.5 text-[11px] flex items-center gap-1 ${deltaTone}`}>
            {dir && (
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d={dir === "up" ? "M7 17L17 7M17 7H9M17 7v8" : "M17 7L7 17M7 17h8M7 17V9"}
                />
              </svg>
            )}
            <span className="font-semibold">{delta}</span>
            <span className="text-muted">{deltaLabel}</span>
          </p>
        ) : (
          aside === undefined && <p className="mt-2.5 text-[11px] text-muted">{deltaLabel}</p>
        )}
      </div>

      {aside && <div className="flex items-center gap-3 shrink-0">{aside}</div>}
      </div>
      {footer && <div className="mt-4 pt-3 border-t border-line">{footer}</div>}
    </div>
  );
}
