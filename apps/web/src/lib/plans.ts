import "server-only";
import { and, asc, count, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { notFound } from "./errors";

export const DEFAULT_ENTITLEMENTS: schema.PlanEntitlements = {
  community: false,
  featured: false,
  maxStaff: null,
  maxConversationsPerMonth: null,
  whatsapp: true,
  telegram: true,
};

export async function listPlans(opts: { publicOnly?: boolean } = {}) {
  const rows = await db.select().from(schema.plans).orderBy(asc(schema.plans.sortOrder), asc(schema.plans.priceCents));
  return opts.publicOnly ? rows.filter((p) => p.public && p.active) : rows;
}

export async function getPlan(id: string) {
  const [p] = await db.select().from(schema.plans).where(eq(schema.plans.id, id));
  if (!p) throw notFound("Plan");
  return p;
}

/** The plan a business is on, with entitlements merged over safe defaults. */
export async function planOf(business: Pick<schema.Business, "tier">) {
  const [p] = await db.select().from(schema.plans).where(eq(schema.plans.id, business.tier));
  const entitlements = { ...DEFAULT_ENTITLEMENTS, ...(p?.entitlements ?? {}) };
  return { plan: p ?? null, entitlements };
}

export async function entitlementsOf(business: Pick<schema.Business, "tier">) {
  return (await planOf(business)).entitlements;
}

export function formatPlanPrice(p: Pick<schema.Plan, "priceCents" | "currency" | "interval">) {
  const amount = new Intl.NumberFormat("en-GB", { style: "currency", currency: p.currency, maximumFractionDigits: p.priceCents % 100 ? 2 : 0 }).format(p.priceCents / 100);
  return { amount, per: p.interval === "year" ? "year" : "month" };
}

/** Agent conversations started this calendar month (UTC): the unit of the monthly AI quota. */
export async function conversationsThisMonth(businessId: string) {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const [r] = await db
    .select({ n: count() })
    .from(schema.conversations)
    .where(and(eq(schema.conversations.businessId, businessId), gte(schema.conversations.createdAt, start), sql`not ${schema.conversations.externalThreadId} like 'test:%'`));
  return Number(r?.n ?? 0);
}

export async function activeStaffCount(businessId: string) {
  const [r] = await db.select({ n: count() }).from(schema.staff).where(and(eq(schema.staff.businessId, businessId), eq(schema.staff.active, true)));
  return Number(r?.n ?? 0);
}
