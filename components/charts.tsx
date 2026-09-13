"use client";

import { useId, useState } from "react";

/**
 * Small, dependency-free SVG charts for the overview page. They read their
 * colours from the CSS tokens (`currentColor` + the primary/accent vars) so
 * they follow the light/dark theme without any JS.
 */

export interface Point {
  label: string;
  value: number;
}

const fmt = (n: number) => n.toLocaleString("fr-FR");

/* ------------------------------------------------------------------ */
/* Bar chart                                                           */
/* ------------------------------------------------------------------ */

export function BarChart({
  data,
  height = 200,
  color = "var(--color-primary)",
  trackColor = "var(--color-line)",
}: {
  data: Point[];
  height?: number;
  color?: string;
  trackColor?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...data.map((d) => d.value), 1);
  const w = 100; // percent-based x; the svg is stretched with preserveAspectRatio="none" per bar
  const barW = data.length ? w / data.length : w;
  const gap = barW * 0.35;

  const ticks = 4;
  const gridVals = Array.from({ length: ticks + 1 }, (_, i) => Math.round((max / ticks) * i));

  return (
    <div className="relative">
      <div className="flex gap-3">
        {/* y axis */}
        <div
          className="flex flex-col justify-between text-[10px] text-muted tabular-nums shrink-0 py-0.5"
          style={{ height }}
        >
          {[...gridVals].reverse().map((v, i) => (
            <span key={i} className="leading-none">
              {fmt(v)}
            </span>
          ))}
        </div>

        <div className="flex-1 min-w-0">
          <div className="relative" style={{ height }}>
            {/* grid */}
            <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
              {gridVals.map((_, i) => (
                <div key={i} className="border-t border-dashed border-line/70" />
              ))}
            </div>

            <svg
              viewBox={`0 0 ${w} 100`}
              preserveAspectRatio="none"
              className="absolute inset-0 w-full h-full overflow-visible"
              onMouseLeave={() => setHover(null)}
            >
              {data.map((d, i) => {
                const x = i * barW + gap / 2;
                const bw = barW - gap;
                const h = (d.value / max) * 100;
                const active = hover === i;
                return (
                  <g key={d.label} onMouseEnter={() => setHover(i)}>
                    {/* track */}
                    <rect x={x} y={0} width={bw} height={100} fill={trackColor} opacity={0.45} rx={0} />
                    {/* value */}
                    <rect
                      x={x}
                      y={100 - h}
                      width={bw}
                      height={h}
                      fill={color}
                      opacity={hover === null || active ? 1 : 0.55}
                      style={{ transition: "opacity .15s" }}
                    />
                  </g>
                );
              })}
            </svg>

            {/* tooltip */}
            {hover !== null && data[hover] && (
              <div
                className="absolute -top-2 -translate-y-full -translate-x-1/2 px-2.5 py-1.5 rounded-lg bg-fg text-bg text-xs font-semibold shadow-lg pointer-events-none whitespace-nowrap z-10"
                style={{ left: `${((hover + 0.5) / data.length) * 100}%` }}
              >
                {fmt(data[hover].value)}
                <span className="font-normal opacity-70 ml-1">{data[hover].label}</span>
              </div>
            )}
          </div>

          {/* x labels */}
          <div className="flex mt-2">
            {data.map((d) => (
              <span
                key={d.label}
                className="flex-1 text-center text-[10px] uppercase tracking-wide text-muted truncate"
              >
                {d.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Line chart                                                          */
/* ------------------------------------------------------------------ */

/** Catmull-Rom → cubic bezier, for a smooth curve through every point. */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return pts.length ? `M${pts[0].x},${pts[0].y}` : "";
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`;
  }
  return d;
}

export function LineChart({
  data,
  height = 200,
  color = "#A855F7",
}: {
  data: Point[];
  height?: number;
  color?: string;
}) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const W = 100;
  const H = 100;
  const max = Math.max(...data.map((d) => d.value), 1);
  const pts = data.map((d, i) => ({
    x: data.length > 1 ? (i / (data.length - 1)) * W : W / 2,
    y: H - (d.value / max) * (H - 8) - 4,
  }));
  const line = smoothPath(pts);
  const area = pts.length ? `${line} L${pts[pts.length - 1].x},${H} L${pts[0].x},${H} Z` : "";

  const ticks = 4;
  const gridVals = Array.from({ length: ticks + 1 }, (_, i) => Math.round((max / ticks) * i));

  // Show a handful of x labels so they never overlap.
  const every = Math.max(1, Math.ceil(data.length / 7));

  return (
    <div className="flex gap-3">
      <div
        className="flex flex-col justify-between text-[10px] text-muted tabular-nums shrink-0 py-0.5"
        style={{ height }}
      >
        {[...gridVals].reverse().map((v, i) => (
          <span key={i} className="leading-none">
            {fmt(v)}
          </span>
        ))}
      </div>

      <div className="flex-1 min-w-0">
        <div className="relative" style={{ height }}>
          <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
            {gridVals.map((_, i) => (
              <div key={i} className="border-t border-dashed border-line/70" />
            ))}
          </div>

          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="absolute inset-0 w-full h-full overflow-visible"
            onMouseLeave={() => setHover(null)}
          >
            <defs>
              <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.28} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <path d={area} fill={`url(#${id}-fill)`} />
            <path
              d={line}
              fill="none"
              stroke={color}
              strokeWidth={2.2}
              vectorEffect="non-scaling-stroke"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* hit areas */}
            {pts.map((p, i) => (
              <rect
                key={i}
                x={p.x - W / data.length / 2}
                y={0}
                width={W / Math.max(data.length, 1)}
                height={H}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
              />
            ))}
          </svg>

          {hover !== null && pts[hover] && (
            <>
              <div
                className="absolute top-0 bottom-0 w-px bg-line pointer-events-none"
                style={{ left: `${pts[hover].x}%` }}
              />
              <div
                className="absolute w-3 h-3 rounded-full border-2 bg-card pointer-events-none -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${pts[hover].x}%`, top: `${pts[hover].y}%`, borderColor: color }}
              />
              <div
                className="absolute -translate-x-1/2 -translate-y-full px-2.5 py-1.5 rounded-lg bg-fg text-bg text-xs font-semibold shadow-lg pointer-events-none whitespace-nowrap z-10"
                style={{ left: `${pts[hover].x}%`, top: `calc(${pts[hover].y}% - 12px)` }}
              >
                {fmt(data[hover].value)}
                <span className="font-normal opacity-70 ml-1">{data[hover].label}</span>
              </div>
            </>
          )}
        </div>

        <div className="flex justify-between mt-2">
          {data.map((d, i) => (
            <span
              key={d.label}
              className={`text-[10px] uppercase tracking-wide text-muted ${
                i % every === 0 || i === data.length - 1 ? "" : "invisible"
              }`}
              style={{ width: 0, whiteSpace: "nowrap" }}
            >
              {d.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Donut                                                               */
/* ------------------------------------------------------------------ */

export interface Segment {
  label: string;
  value: number;
  color: string;
}

export function Donut({
  segments,
  size = 84,
  thickness = 11,
}: {
  segments: Segment[];
  size?: number;
  thickness?: number;
}) {
  const total = Math.max(
    segments.reduce((s, x) => s + x.value, 0),
    1,
  );
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--color-line)"
        strokeWidth={thickness}
        opacity={0.6}
      />
      {segments.map((s) => {
        const len = (s.value / total) * c;
        const el = (
          <circle
            key={s.label}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={s.color}
            strokeWidth={thickness}
            strokeDasharray={`${len} ${c - len}`}
            strokeDashoffset={-offset}
            strokeLinecap="butt"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        );
        offset += len;
        return el;
      })}
    </svg>
  );
}

export function DonutLegend({ segments }: { segments: Segment[] }) {
  const total = Math.max(segments.reduce((s, x) => s + x.value, 0), 1);
  return (
    <ul className="space-y-1.5">
      {segments.map((s) => (
        <li key={s.label} className="flex items-center gap-2 text-[11px] text-muted">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
          <span className="font-semibold text-fg tabular-nums">
            {Math.round((s.value / total) * 100)}%
          </span>
          <span className="truncate">{s.label}</span>
        </li>
      ))}
    </ul>
  );
}
