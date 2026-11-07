import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { notFound } from "./errors";
import { platformCan } from "./platform-rbac";
import { entitlementsOf } from "./plans";
import { listServices } from "./queries";

/** A published business by slug, as customers may see it. Suspended/unpublished businesses are hidden. */
export async function publicBusiness(slug: string, opts: { allowUnpublished?: boolean } = {}) {
  const [business] = await db.select().from(schema.businesses).where(eq(schema.businesses.slug, slug));
  if (!business || business.suspended || (!business.published && !opts.allowUnpublished)) throw notFound("Business");
  return business;
}

export async function publicProfile(business: schema.Business) {
  const [services, staff, locations] = await Promise.all([
    listServices(business.id, false),
    db.select({ id: schema.staff.id, name: schema.staff.name, title: schema.staff.title, bio: schema.staff.bio, color: schema.staff.color })
      .from(schema.staff).where(and(eq(schema.staff.businessId, business.id), eq(schema.staff.active, true))).orderBy(asc(schema.staff.createdAt)),
    db.select().from(schema.locations).where(eq(schema.locations.businessId, business.id)),
  ]);
  const { id, slug, name, tagline, description, category, city, phone, email, website, timezone, currency, brandColor, logoUrl, coverUrl, policy } = business;
  return {
    business: { id, slug, name, tagline, description, category, city, phone, email, website, timezone, currency, brandColor, logoUrl, coverUrl, vip: (await entitlementsOf(business)).featured, policy: { cancellationWindowHours: policy.cancellationWindowHours, maxAdvanceDays: policy.maxAdvanceDays, autoConfirm: policy.autoConfirm, policyText: policy.policyText } },
    services: services.map(({ id, name, description, category, durationMinutes, priceCents, staffIds }) => ({ id, name, description, category, durationMinutes, priceCents, staffIds })),
    staff,
    locations,
  };
}

/** Like publicBusiness, but team members (session cookie) may also use their own unpublished page. */
export async function businessForRequest(req: Request, slug: string) {
  try {
    return await publicBusiness(slug);
  } catch (e) {
    const { userFromRequest } = await import("./auth");
    const user = await userFromRequest(req).catch(() => null);
    if (!user) throw e;
    const business = await publicBusiness(slug, { allowUnpublished: true });
    const [m] = await db.select().from(schema.memberships).where(and(eq(schema.memberships.businessId, business.id), eq(schema.memberships.userId, user.id)));
    if (!m && !platformCan(user.platformRole, "businesses.view")) throw e;
    return business;
  }
}
