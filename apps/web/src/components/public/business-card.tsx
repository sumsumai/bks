import Link from "next/link";
import { Icon } from "../icons";
import { Badge } from "../ui";
import { formatMoney } from "@/lib/time";

export type BizCard = { slug: string; name: string; tagline: string; city: string; category: string; brandColor: string; coverUrl: string | null; vip: boolean; currency: string; fromPriceCents: number | null; serviceCount: number };

export function BusinessCard({ b }: { b: BizCard }) {
  return (
    <Link href={`/b/${b.slug}`} className="group overflow-hidden rounded-card border border-border bg-surface shadow-card transition hover:-translate-y-0.5 hover:shadow-pop">
      <div className="relative aspect-[16/10] overflow-hidden" style={{ background: b.brandColor }}>
        {b.coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={b.coverUrl} alt="" className="size-full object-cover transition duration-500 group-hover:scale-[1.03]" loading="lazy" />
        )}
        <div className="absolute top-3 left-3 flex gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur"><Icon name="sparkles" size={11} /> Instant answers</span>
        </div>
      </div>
      <div className="p-4">
        <div className="flex items-center gap-2">
          <h3 className="truncate font-semibold">{b.name}</h3>
          {b.vip && <Badge tone="ai" icon="crown">VIP</Badge>}
        </div>
        <p className="mt-0.5 line-clamp-1 text-[14px] text-muted">{b.tagline || "Book online in seconds"}</p>
        <div className="mt-3 flex items-center justify-between text-[13px] text-muted">
          <span className="flex items-center gap-1"><Icon name="mapPin" size={14} /> {b.city || "—"}</span>
          {b.fromPriceCents != null && <span>from <span className="font-semibold text-fg">{formatMoney(Number(b.fromPriceCents), b.currency)}</span></span>}
        </div>
      </div>
    </Link>
  );
}
