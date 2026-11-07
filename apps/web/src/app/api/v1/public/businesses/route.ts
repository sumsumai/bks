import { publicRoute, query } from "@/lib/api";
import { searchBusinesses } from "@/lib/businesses";

export const GET = publicRoute(async (req) => {
  const q = query(req);
  const rows = await searchBusinesses({ q: q.get("q") ?? undefined, category: q.get("category") ?? undefined, city: q.get("city") ?? undefined });
  return {
    businesses: rows.map(({ business: b, fromPrice, serviceCount, featured }) => ({ slug: b.slug, name: b.name, tagline: b.tagline, category: b.category, city: b.city, brandColor: b.brandColor, coverUrl: b.coverUrl, vip: Boolean(featured), currency: b.currency, fromPriceCents: fromPrice, serviceCount })),
  };
});
