"use client";

import { useState } from "react";

type Day = { day: string; revenueCents: number; bookings: number };

/**
 * Daily revenue, one series. Past days are solid; days ahead (already booked) carry a diagonal texture
 * so "booked" vs "earned" never depends on color alone. Per-bar hover tooltip, recessive baseline.
 */
export function RevenueChart({ days, currency, today }: { days: Day[]; currency: string; today: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...days.map((d) => d.revenueCents));
  const fmt = (c: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(c / 100);
  const W = 720;
  const H = 160;
  const gap = 2;
  const bw = days.length ? W / days.length - gap : 0;
  const h = hover !== null ? days[hover] : null;

  if (!days.length) return <div className="grid h-40 place-items-center text-[13px] text-muted">No bookings yet in this period.</div>;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H + 20}`} className="h-auto w-full" role="img" aria-label="Daily revenue">
        <defs>
          <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="var(--ai)" opacity="0.18" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--ai)" strokeWidth="2" opacity="0.7" />
          </pattern>
        </defs>
        <line x1="0" x2={W} y1={H} y2={H} stroke="var(--border)" />
        {days.map((d, i) => {
          const bh = Math.max(d.revenueCents ? 3 : 0, (d.revenueCents / max) * (H - 8));
          const x = i * (W / days.length) + gap / 2;
          const future = d.day > today;
          return (
            <g key={d.day} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={x - gap / 2} y={0} width={W / days.length} height={H} fill="transparent" />
              {bh > 0 && <path d={roundedTop(x, H - bh, bw, bh, Math.min(4, bw / 2))} fill={future ? "url(#hatch)" : "var(--ai)"} opacity={hover === null || hover === i ? 1 : 0.45} />}
              {d.day === today && <text x={x + bw / 2} y={H + 14} textAnchor="middle" fontSize="10" fill="var(--muted)">today</text>}
            </g>
          );
        })}
      </svg>
      {h && hover !== null && (
        <div
          className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-border bg-surface px-3 py-2 text-[12px] shadow-pop"
          style={{ left: `${((hover + 0.5) / days.length) * 100}%` }}
        >
          <div className="font-medium">{new Date(`${h.day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</div>
          <div className="tabular-nums text-muted">
            {fmt(h.revenueCents)} · {h.bookings} booking{h.bookings === 1 ? "" : "s"}
            {h.day > today ? " (booked)" : ""}
          </div>
        </div>
      )}
      <div className="mt-2 flex items-center gap-4 text-[12px] text-muted">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-ai" /> Earned</span>
        <span className="flex items-center gap-1.5">
          <svg width="10" height="10"><rect width="10" height="10" rx="2" fill="url(#hatch)" /></svg> Booked ahead
        </span>
      </div>
    </div>
  );
}

function roundedTop(x: number, y: number, w: number, h: number, r: number) {
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}
