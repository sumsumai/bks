import "server-only";
import { and, asc, desc, eq, gte, ilike, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { notFound } from "./errors";

// Read models shared by the web workspace, the mobile API and the admin console. Every function takes
// the business id first and filters by it.

export async function listBookings(
  businessId: string,
  opts: { from?: Date; to?: Date; status?: schema.Booking["status"][]; customerId?: string; limit?: number } = {},
) {
  const where = [eq(schema.bookings.businessId, businessId)];
  if (opts.from) where.push(gte(schema.bookings.startsAt, opts.from));
  if (opts.to) where.push(lt(schema.bookings.startsAt, opts.to));
  if (opts.status?.length) where.push(inArray(schema.bookings.status, opts.status));
  if (opts.customerId) where.push(eq(schema.bookings.customerId, opts.customerId));
  const rows = await db
    .select({
      booking: schema.bookings,
      service: { id: schema.services.id, name: schema.services.name, durationMinutes: schema.services.durationMinutes },
      staff: { id: schema.staff.id, name: schema.staff.name, color: schema.staff.color },
      customer: { id: schema.customers.id, name: schema.customers.name, phone: schema.customers.phone, email: schema.customers.email },
    })
    .from(schema.bookings)
    .innerJoin(schema.services, eq(schema.services.id, schema.bookings.serviceId))
    .innerJoin(schema.staff, eq(schema.staff.id, schema.bookings.staffId))
    .innerJoin(schema.customers, eq(schema.customers.id, schema.bookings.customerId))
    .where(and(...where))
    .orderBy(asc(schema.bookings.startsAt))
    .limit(opts.limit ?? 500);
  return rows.map((r) => ({ ...r.booking, manageToken: undefined, service: r.service, staff: r.staff, customer: r.customer }));
}
export type BookingRow = Awaited<ReturnType<typeof listBookings>>[number];

export async function getBookingRow(businessId: string, bookingId: string) {
  const [row] = await db
    .select({
      booking: schema.bookings,
      service: { id: schema.services.id, name: schema.services.name, durationMinutes: schema.services.durationMinutes },
      staff: { id: schema.staff.id, name: schema.staff.name, color: schema.staff.color },
      customer: { id: schema.customers.id, name: schema.customers.name, phone: schema.customers.phone, email: schema.customers.email },
    })
    .from(schema.bookings)
    .innerJoin(schema.services, eq(schema.services.id, schema.bookings.serviceId))
    .innerJoin(schema.staff, eq(schema.staff.id, schema.bookings.staffId))
    .innerJoin(schema.customers, eq(schema.customers.id, schema.bookings.customerId))
    .where(and(eq(schema.bookings.businessId, businessId), eq(schema.bookings.id, bookingId)));
  if (!row) throw notFound("Booking");
  return { ...row.booking, manageToken: undefined, service: row.service, staff: row.staff, customer: row.customer };
}

export async function listServices(businessId: string, includeInactive = true) {
  const services = await db
    .select()
    .from(schema.services)
    .where(and(eq(schema.services.businessId, businessId), includeInactive ? undefined : eq(schema.services.active, true)))
    .orderBy(asc(schema.services.sortOrder), asc(schema.services.name));
  const links = services.length
    ? await db.select().from(schema.serviceStaff).where(inArray(schema.serviceStaff.serviceId, services.map((s) => s.id)))
    : [];
  return services.map((s) => ({ ...s, staffIds: links.filter((l) => l.serviceId === s.id).map((l) => l.staffId) }));
}

export async function listStaff(businessId: string) {
  const staff = await db.select().from(schema.staff).where(eq(schema.staff.businessId, businessId)).orderBy(asc(schema.staff.createdAt));
  const rules = await db.select().from(schema.availabilityRules).where(eq(schema.availabilityRules.businessId, businessId));
  return staff.map((s) => ({
    ...s,
    hours: rules.filter((r) => r.staffId === s.id).map((r) => ({ weekday: r.weekday, startMinute: r.startMinute, endMinute: r.endMinute })),
  }));
}

export async function listConversations(businessId: string, opts: { status?: "open" | "escalated" | "closed"; limit?: number } = {}) {
  const rows = await db
    .select({
      conversation: schema.conversations,
      customer: { id: schema.customers.id, name: schema.customers.name },
      lastMessage: sql<string | null>`(select content from messages m where m.conversation_id = ${schema.conversations.id} order by m.created_at desc limit 1)`,
      lastRole: sql<string | null>`(select role from messages m where m.conversation_id = ${schema.conversations.id} order by m.created_at desc limit 1)`,
    })
    .from(schema.conversations)
    .leftJoin(schema.customers, eq(schema.customers.id, schema.conversations.customerId))
    .where(and(eq(schema.conversations.businessId, businessId), opts.status ? eq(schema.conversations.status, opts.status) : undefined))
    .orderBy(desc(schema.conversations.lastMessageAt))
    .limit(opts.limit ?? 100);
  return rows.map((r) => ({ ...r.conversation, customer: r.customer, lastMessage: r.lastMessage, lastRole: r.lastRole }));
}

export async function getConversation(businessId: string, conversationId: string) {
  const [row] = await db
    .select({ conversation: schema.conversations, customer: schema.customers })
    .from(schema.conversations)
    .leftJoin(schema.customers, eq(schema.customers.id, schema.conversations.customerId))
    .where(and(eq(schema.conversations.businessId, businessId), eq(schema.conversations.id, conversationId)));
  if (!row) throw notFound("Conversation");
  const [messages, actions] = await Promise.all([
    db.select().from(schema.messages).where(eq(schema.messages.conversationId, conversationId)).orderBy(asc(schema.messages.createdAt)),
    db.select().from(schema.agentActions).where(and(eq(schema.agentActions.businessId, businessId), eq(schema.agentActions.conversationId, conversationId))).orderBy(asc(schema.agentActions.createdAt)),
  ]);
  return { ...row.conversation, customer: row.customer, messages, actions };
}

export async function listActions(businessId: string, opts: { status?: schema.AgentAction["status"]; limit?: number } = {}) {
  return db
    .select({
      action: schema.agentActions,
      customerName: schema.customers.name,
      channel: schema.conversations.channel,
    })
    .from(schema.agentActions)
    .leftJoin(schema.conversations, eq(schema.conversations.id, schema.agentActions.conversationId))
    .leftJoin(schema.customers, eq(schema.customers.id, schema.conversations.customerId))
    .where(and(eq(schema.agentActions.businessId, businessId), opts.status ? eq(schema.agentActions.status, opts.status) : undefined))
    .orderBy(desc(schema.agentActions.createdAt))
    .limit(opts.limit ?? 100)
    .then((rows) => rows.map((r) => ({ ...r.action, customerName: r.customerName, channel: r.channel })));
}

export async function listCustomers(businessId: string, q?: string) {
  const like = q ? `%${q}%` : null;
  return db
    .select({
      customer: schema.customers,
      bookings: sql<number>`(select count(*)::int from bookings b where b.customer_id = "customers"."id")`,
      lastVisit: sql<Date | null>`(select max(starts_at) from bookings b where b.customer_id = "customers"."id" and b.status in ('confirmed','completed'))`,
      spentCents: sql<number>`(select coalesce(sum(price_cents),0)::int from bookings b where b.customer_id = "customers"."id" and b.status = 'completed')`,
    })
    .from(schema.customers)
    .where(
      and(
        eq(schema.customers.businessId, businessId),
        isNull(schema.customers.erasedAt),
        like ? or(ilike(schema.customers.name, like), ilike(schema.customers.email, like), ilike(schema.customers.phone, like)) : undefined,
      ),
    )
    .orderBy(desc(schema.customers.createdAt))
    .limit(200)
    .then((rows) => rows.map((r) => ({ ...r.customer, bookings: Number(r.bookings), lastVisit: r.lastVisit, spentCents: Number(r.spentCents) })));
}

export async function listNotifications(businessId: string, limit = 50) {
  return db.select().from(schema.notifications).where(eq(schema.notifications.businessId, businessId)).orderBy(desc(schema.notifications.createdAt)).limit(limit);
}

export async function unreadCounts(businessId: string) {
  const [r] = (
    await db.execute(sql`select
      (select count(*) from notifications where business_id = ${businessId} and read_at is null) as notifications,
      (select count(*) from agent_actions where business_id = ${businessId} and status = 'pending_approval') as approvals,
      (select count(*) from conversations where business_id = ${businessId} and status = 'escalated') as escalations`)
  ).rows as Record<string, unknown>[];
  return { notifications: Number(r.notifications), approvals: Number(r.approvals), escalations: Number(r.escalations) };
}
