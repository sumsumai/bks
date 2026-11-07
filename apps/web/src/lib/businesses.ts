import "server-only";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { provisionAgent } from "./agent/provision";
import { audit } from "./events";
import { newId, randomId, slugify } from "./ids";

export const CATEGORIES = [
  { id: "hair", label: "Hair salon" },
  { id: "barber", label: "Barber" },
  { id: "beauty", label: "Beauty & nails" },
  { id: "spa", label: "Spa & massage" },
  { id: "fitness", label: "Fitness & coaching" },
  { id: "health", label: "Health & therapy" },
  { id: "tattoo", label: "Tattoo & piercing" },
  { id: "pets", label: "Pet care" },
  { id: "auto", label: "Auto services" },
  { id: "education", label: "Lessons & tutoring" },
  { id: "other", label: "Other services" },
] as const;

export async function uniqueSlug(name: string) {
  const base = slugify(name) || "business";
  for (let i = 0; i < 20; i++) {
    const slug = i === 0 ? base : `${base}-${randomId(4)}`;
    const [hit] = await db.select({ id: schema.businesses.id }).from(schema.businesses).where(eq(schema.businesses.slug, slug));
    if (!hit) return slug;
  }
  return `${base}-${randomId(8)}`;
}

export type NewBusinessInput = {
  name: string;
  category: string;
  city: string;
  timezone: string;
  currency: string;
  locale?: string;
  phone?: string;
  description?: string;
  ownerAsStaff?: boolean;
};

/**
 * Create a tenant: the business, the owner's membership, a trial subscription, a default location,
 * the owner as the first staff member with weekday hours, and the business's NanoClaw agent.
 */
export async function createBusiness(owner: { id: string; name: string }, input: NewBusinessInput) {
  const id = newId("biz");
  const slug = await uniqueSlug(input.name);
  const [business] = await db
    .insert(schema.businesses)
    .values({
      id,
      slug,
      name: input.name.trim(),
      category: input.category,
      city: input.city.trim(),
      timezone: input.timezone,
      currency: input.currency,
      locale: input.locale ?? "en",
      phone: input.phone ?? "",
      description: input.description ?? "",
      onboardingStep: 1,
    })
    .returning();
  await db.insert(schema.memberships).values({ businessId: id, userId: owner.id, role: "owner" });
  const trialDays = (await db.select({ d: schema.plans.trialDays }).from(schema.plans).where(eq(schema.plans.id, "standard")))[0]?.d ?? 14;
  await db.insert(schema.subscriptions).values({ businessId: id, tier: "standard", status: trialDays ? "trialing" : "active", provider: "test", currentPeriodEnd: new Date(Date.now() + Math.max(trialDays, 30) * 86400_000) });
  const locationId = newId("loc");
  await db.insert(schema.locations).values({ id: locationId, businessId: id, name: "Main location", address: input.city });
  if (input.ownerAsStaff !== false) {
    const staffId = newId("stf");
    await db.insert(schema.staff).values({ id: staffId, businessId: id, name: owner.name, title: "Owner", userId: owner.id, locationId });
    await db.insert(schema.availabilityRules).values(
      [1, 2, 3, 4, 5].map((weekday) => ({ id: newId("avl"), businessId: id, staffId, weekday, startMinute: 9 * 60, endMinute: 18 * 60 })),
    );
  }
  await provisionAgent(business, { actorUserId: owner.id });
  await audit(id, { type: "user", id: owner.id }, "business.created", id, { slug });
  return business;
}

/** Marketplace search over published, non-suspended businesses. */
export async function searchBusinesses(opts: { q?: string; category?: string; city?: string; limit?: number }) {
  const where = [sql`${schema.businesses.published} = true`, sql`${schema.businesses.suspended} = false`];
  if (opts.category) where.push(sql`${schema.businesses.category} = ${opts.category}`);
  if (opts.city) where.push(sql`lower(${schema.businesses.city}) like ${`%${opts.city.toLowerCase()}%`}`);
  if (opts.q) {
    const like = `%${opts.q.toLowerCase()}%`;
    where.push(
      sql`(lower(${schema.businesses.name}) like ${like} or lower(${schema.businesses.description}) like ${like} or lower(${schema.businesses.tagline}) like ${like}
        or exists (select 1 from services s where s.business_id = "businesses"."id" and s.active and lower(s.name) like ${like}))`,
    );
  }
  return db
    .select({
      business: schema.businesses,
      fromPrice: sql<number | null>`(select min(price_cents) from services s where s.business_id = "businesses"."id" and s.active)`,
      serviceCount: sql<number>`(select count(*)::int from services s where s.business_id = "businesses"."id" and s.active)`,
      featured: sql<boolean>`coalesce((select (p.entitlements->>'featured')::boolean from plans p where p.id = "businesses"."tier"), false)`,
    })
    .from(schema.businesses)
    .where(sql.join(where, sql` and `))
    .orderBy(sql`coalesce((select (p.entitlements->>'featured')::boolean from plans p where p.id = "businesses"."tier"), false) desc`, schema.businesses.name)
    .limit(opts.limit ?? 48);
}
