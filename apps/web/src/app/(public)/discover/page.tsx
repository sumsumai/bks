import Link from "next/link";
import { BusinessCard } from "@/components/public/business-card";
import { Button, cx, Empty, Input } from "@/components/ui";
import { CATEGORIES, searchBusinesses } from "@/lib/businesses";

export const metadata = { title: "Discover" };

export default async function Discover({ searchParams }: { searchParams: Promise<{ q?: string; city?: string; category?: string }> }) {
  const sp = await searchParams;
  const rows = await searchBusinesses({ q: sp.q, city: sp.city, category: sp.category });
  const link = (category?: string) => `/discover?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(sp.city ? { city: sp.city } : {}), ...(category ? { category } : {}) })}`;
  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="text-[30px] font-semibold tracking-tight">{CATEGORIES.find((c) => c.id === sp.category)?.label ?? "Discover"}</h1>
      <form className="mt-5 flex max-w-2xl gap-2">
        {sp.category && <input type="hidden" name="category" value={sp.category} />}
        <Input name="q" defaultValue={sp.q} placeholder="Service or business" />
        <Input name="city" defaultValue={sp.city} placeholder="City" className="max-w-40" />
        <Button>Search</Button>
      </form>
      <div className="scrollbar-none mt-4 flex gap-2 overflow-x-auto pb-1">
        <Link href={link()} className={cx("shrink-0 rounded-full border px-3.5 py-1.5 text-[13px]", !sp.category ? "border-fg bg-fg text-bg" : "border-border text-muted")}>All</Link>
        {CATEGORIES.map((c) => (
          <Link key={c.id} href={link(c.id)} className={cx("shrink-0 rounded-full border px-3.5 py-1.5 text-[13px]", sp.category === c.id ? "border-fg bg-fg text-bg" : "border-border text-muted")}>{c.label}</Link>
        ))}
      </div>
      {rows.length ? (
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map(({ business: b, fromPrice, serviceCount, featured }) => (
            <BusinessCard key={b.id} b={{ slug: b.slug, name: b.name, tagline: b.tagline, city: b.city, category: b.category, brandColor: b.brandColor, coverUrl: b.coverUrl, vip: Boolean(featured), currency: b.currency, fromPriceCents: fromPrice, serviceCount }} />
          ))}
        </div>
      ) : (
        <Empty icon="search" title="No matches">Try another search or category.</Empty>
      )}
    </main>
  );
}
