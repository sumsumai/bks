import "server-only";
import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db, schema } from "@/db";
import type { SessionUser } from "./auth";
import { requireUser } from "./auth";
import { forbidden, notFound } from "./errors";
import { platformCan } from "./platform-rbac";
import { can, type BusinessRole, type Permission } from "./rbac";

export const ACTIVE_BUSINESS_COOKIE = "bks_biz";

/**
 * A tenant context: the one business a request acts on, and the caller's role in it.
 * Everything tenant-scoped takes a Tenant, never a raw business id from input.
 */
export type Tenant = {
  business: schema.Business;
  role: BusinessRole;
  user: SessionUser;
  /** Platform admins acting on a business they are not a member of. */
  asAdmin: boolean;
};

export async function membershipsOf(userId: string) {
  return db
    .select({ business: schema.businesses, role: schema.memberships.role })
    .from(schema.memberships)
    .innerJoin(schema.businesses, eq(schema.businesses.id, schema.memberships.businessId))
    .where(eq(schema.memberships.userId, userId))
    .orderBy(schema.businesses.createdAt);
}

export async function resolveTenant(user: SessionUser, businessId: string | null | undefined): Promise<Tenant> {
  if (businessId) {
    const [row] = await db
      .select({ business: schema.businesses, role: schema.memberships.role })
      .from(schema.memberships)
      .innerJoin(schema.businesses, eq(schema.businesses.id, schema.memberships.businessId))
      .where(and(eq(schema.memberships.userId, user.id), eq(schema.memberships.businessId, businessId)))
      .limit(1);
    if (row) return { ...row, user, asAdmin: false };
    // Platform staff with business-management rights may act on any business (audited as admin).
    if (platformCan(user.platformRole, "businesses.manage")) {
      const [business] = await db.select().from(schema.businesses).where(eq(schema.businesses.id, businessId));
      if (business) return { business, role: "owner", user, asAdmin: true };
    }
    throw notFound("Business");
  }
  const all = await membershipsOf(user.id);
  if (!all.length) throw notFound("Business");
  return { ...all[0], user, asAdmin: false };
}

export function requirePermission(t: Tenant, p: Permission) {
  if (!can(t.role, p)) throw forbidden();
}

/** Web workspace: the active business for the signed-in user, or redirect to onboarding. */
export const currentTenant = cache(async (): Promise<Tenant> => {
  const user = await requireUser("/app");
  const jar = await cookies();
  const wanted = jar.get(ACTIVE_BUSINESS_COOKIE)?.value;
  const all = await membershipsOf(user.id);
  if (!all.length) redirect("/app/onboarding");
  const pick = all.find((m) => m.business.id === wanted) ?? all[0];
  return { ...pick, user, asAdmin: false };
});

/** Server action guard: active tenant + permission, throws instead of redirecting. */
export async function tenantFor(p: Permission): Promise<Tenant> {
  const t = await currentTenant();
  requirePermission(t, p);
  return t;
}

/** API: tenant from the X-Business-Id header (mobile) or the first membership. */
export async function tenantFromRequest(req: Request, user: SessionUser, p?: Permission): Promise<Tenant> {
  const t = await resolveTenant(user, req.headers.get("x-business-id"));
  if (p) requirePermission(t, p);
  return t;
}
