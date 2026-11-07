import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { getService, getSlots } from "./availability";
import { messageCustomer } from "./conversations";
import { randomToken } from "./crypto";
import { badRequest, conflict, forbidden, notFound } from "./errors";
import { audit, notifyBusiness, type Actor } from "./events";
import { newId } from "./ids";
import { formatDateTime, zonedParts } from "./time";

export type CustomerInput =
  | { id: string }
  | { name: string; email?: string | null; phone?: string | null; telegramChatId?: string; whatsappId?: string; marketingConsent?: boolean };

/** Find a customer within this business by email/phone/channel id, or create one. Never crosses businesses. */
export async function findOrCreateCustomer(businessId: string, input: CustomerInput): Promise<schema.Customer> {
  if ("id" in input) {
    const [c] = await db
      .select()
      .from(schema.customers)
      .where(and(eq(schema.customers.id, input.id), eq(schema.customers.businessId, businessId)));
    if (!c) throw notFound("Customer");
    return c;
  }
  const email = input.email?.trim().toLowerCase() || null;
  const phone = input.phone?.replace(/[^\d+]/g, "") || null;
  const match = [
    email && sql`lower(${schema.customers.email}) = ${email}`,
    phone && sql`${schema.customers.phone} = ${phone}`,
    input.telegramChatId && sql`${schema.customers.telegramChatId} = ${input.telegramChatId}`,
    input.whatsappId && sql`${schema.customers.whatsappId} = ${input.whatsappId}`,
  ].filter(Boolean);
  if (match.length) {
    const [c] = await db
      .select()
      .from(schema.customers)
      .where(and(eq(schema.customers.businessId, businessId), sql`(${sql.join(match as any[], sql` or `)})`, sql`${schema.customers.erasedAt} is null`))
      .limit(1);
    if (c) {
      const patch: Partial<schema.Customer> = {};
      if (email && !c.email) patch.email = email;
      if (phone && !c.phone) patch.phone = phone;
      if (input.name && (c.name.startsWith("+") || c.name === "Telegram user")) patch.name = input.name;
      if (Object.keys(patch).length) await db.update(schema.customers).set(patch).where(eq(schema.customers.id, c.id));
      return { ...c, ...patch };
    }
  }
  const [c] = await db
    .insert(schema.customers)
    .values({
      id: newId("cus"),
      businessId,
      name: input.name.trim() || "Customer",
      email,
      phone,
      telegramChatId: input.telegramChatId ?? null,
      whatsappId: input.whatsappId ?? null,
      marketingConsent: input.marketingConsent ?? false,
    })
    .returning();
  return c;
}

function isOverlapError(e: unknown): boolean {
  const err = e as { code?: string; cause?: { code?: string }; message?: string };
  return err?.code === "23P01" || err?.cause?.code === "23P01" || /bookings_no_overlap/.test(String(err?.message ?? "") + String((err?.cause as any)?.message ?? ""));
}

export type CreateBookingInput = {
  serviceId: string;
  startsAt: string | Date;
  staffId?: string | null;
  customer: CustomerInput;
  source: schema.Booking["source"];
  notes?: string;
  /** Owners may place bookings outside the published slots (walk-ins, overrides). Overlaps are still refused. */
  override?: boolean;
};

export async function createBooking(business: schema.Business, input: CreateBookingInput, actor: Actor) {
  if (business.suspended) throw forbidden("This business is not taking bookings right now");
  const service = await getService(business.id, input.serviceId);
  const startsAt = new Date(input.startsAt);
  if (Number.isNaN(startsAt.getTime())) throw badRequest("Invalid start time");

  let staffId = input.staffId ?? null;
  if (!input.override) {
    const { date } = zonedParts(startsAt, business.timezone);
    const slots = await getSlots(business, { serviceId: service.id, date, staffId, ignoreNotice: actor.type === "user" });
    const slot = slots.find((s) => new Date(s.startsAt).getTime() === startsAt.getTime());
    if (!slot) throw conflict("slot_unavailable", "That time is no longer available. Please pick another slot.");
    staffId = staffId ?? slot.staffIds[0];
  }
  if (!staffId) throw badRequest("A staff member is required");
  const [st] = await db.select().from(schema.staff).where(and(eq(schema.staff.id, staffId), eq(schema.staff.businessId, business.id)));
  if (!st) throw notFound("Staff member");

  const customer = await findOrCreateCustomer(business.id, input.customer);
  const endsAt = new Date(startsAt.getTime() + (service.durationMinutes + service.bufferMinutes) * 60_000);
  const status = actor.type === "user" || business.policy.autoConfirm ? "confirmed" : "pending";

  let booking: schema.Booking;
  try {
    [booking] = await db
      .insert(schema.bookings)
      .values({
        id: newId("bkg"),
        businessId: business.id,
        customerId: customer.id,
        serviceId: service.id,
        staffId,
        locationId: st.locationId,
        startsAt,
        endsAt,
        status,
        source: input.source,
        priceCents: service.priceCents,
        notes: input.notes ?? "",
        manageToken: randomToken(18),
      })
      .returning();
  } catch (e) {
    if (isOverlapError(e)) throw conflict("slot_taken", "Someone just booked that time. Please pick another slot.");
    throw e;
  }

  const when = formatDateTime(startsAt, business.timezone);
  await audit(business.id, actor, "booking.created", booking.id, { serviceId: service.id, startsAt: startsAt.toISOString(), source: input.source });
  await notifyBusiness(business.id, {
    kind: "booking.created",
    title: status === "pending" ? `Booking request: ${service.name}` : `New booking: ${service.name}`,
    body: `${customer.name} · ${when} with ${st.name}`,
    href: `/app/bookings?focus=${booking.id}`,
  });
  return { booking, customer, service, staff: st };
}

async function loadBooking(business: schema.Business, bookingId: string) {
  const [b] = await db
    .select()
    .from(schema.bookings)
    .where(and(eq(schema.bookings.id, bookingId), eq(schema.bookings.businessId, business.id)));
  if (!b) throw notFound("Booking");
  return b;
}

function assertCustomerWindow(business: schema.Business, b: schema.Booking) {
  const hours = (b.startsAt.getTime() - Date.now()) / 3600_000;
  if (hours < business.policy.cancellationWindowHours)
    throw conflict(
      "outside_window",
      `Changes are only possible up to ${business.policy.cancellationWindowHours}h before the appointment. Please contact ${business.name}.`,
    );
}

export async function cancelBooking(business: schema.Business, bookingId: string, reason: string, actor: Actor) {
  const b = await loadBooking(business, bookingId);
  if (b.status === "cancelled") return b;
  if (!["pending", "confirmed"].includes(b.status)) throw conflict("not_cancellable", "This booking can no longer be cancelled");
  if (actor.type !== "user") assertCustomerWindow(business, b);
  const [updated] = await db
    .update(schema.bookings)
    .set({ status: "cancelled", cancelReason: reason || null, updatedAt: new Date() })
    .where(eq(schema.bookings.id, b.id))
    .returning();
  await audit(business.id, actor, "booking.cancelled", b.id, { reason });
  const [c] = await db.select().from(schema.customers).where(eq(schema.customers.id, b.customerId));
  if (actor.type !== "user") {
    await notifyBusiness(business.id, {
      kind: "booking.cancelled",
      title: "Booking cancelled",
      body: `${c?.name ?? "Customer"} · ${formatDateTime(b.startsAt, business.timezone)}`,
      href: `/app/bookings?focus=${b.id}`,
    });
  } else {
    await messageCustomer(
      business.id,
      b.customerId,
      `Your appointment at ${business.name} on ${formatDateTime(b.startsAt, business.timezone)} has been cancelled.${reason ? ` Reason: ${reason}` : ""}`,
    );
  }
  return updated;
}

export async function rescheduleBooking(
  business: schema.Business,
  bookingId: string,
  newStartsAt: string | Date,
  actor: Actor,
  opts: { staffId?: string | null; override?: boolean } = {},
) {
  const b = await loadBooking(business, bookingId);
  if (!["pending", "confirmed"].includes(b.status)) throw conflict("not_reschedulable", "This booking can no longer be changed");
  if (actor.type !== "user") assertCustomerWindow(business, b);
  const service = await getService(business.id, b.serviceId);
  const startsAt = new Date(newStartsAt);
  let staffId = opts.staffId ?? null;
  if (!opts.override) {
    const { date } = zonedParts(startsAt, business.timezone);
    const slots = await getSlots(business, { serviceId: service.id, date, staffId, excludeBookingId: b.id, ignoreNotice: actor.type === "user" });
    const slot = slots.find((s) => new Date(s.startsAt).getTime() === startsAt.getTime());
    if (!slot) throw conflict("slot_unavailable", "That time is not available");
    staffId = staffId ?? (slot.staffIds.includes(b.staffId) ? b.staffId : slot.staffIds[0]);
  }
  staffId = staffId ?? b.staffId;
  const endsAt = new Date(startsAt.getTime() + (service.durationMinutes + service.bufferMinutes) * 60_000);
  let updated: schema.Booking;
  try {
    [updated] = await db
      .update(schema.bookings)
      .set({ startsAt, endsAt, staffId, reminderSentAt: null, updatedAt: new Date() })
      .where(eq(schema.bookings.id, b.id))
      .returning();
  } catch (e) {
    if (isOverlapError(e)) throw conflict("slot_taken", "That time was just taken");
    throw e;
  }
  await audit(business.id, actor, "booking.rescheduled", b.id, { from: b.startsAt.toISOString(), to: startsAt.toISOString() });
  const when = formatDateTime(startsAt, business.timezone);
  if (actor.type !== "user") {
    await notifyBusiness(business.id, { kind: "booking.rescheduled", title: "Booking moved", body: `${service.name} → ${when}`, href: `/app/bookings?focus=${b.id}` });
  } else {
    await messageCustomer(business.id, b.customerId, `Your ${service.name} at ${business.name} has been moved to ${when}.`);
  }
  return updated;
}

export async function setBookingStatus(
  business: schema.Business,
  bookingId: string,
  status: "confirmed" | "completed" | "no_show",
  actor: Actor,
) {
  const b = await loadBooking(business, bookingId);
  const [updated] = await db
    .update(schema.bookings)
    .set({ status, updatedAt: new Date() })
    .where(eq(schema.bookings.id, b.id))
    .returning();
  await audit(business.id, actor, `booking.${status}`, b.id);
  if (status === "confirmed" && b.status === "pending") {
    const service = await getService(business.id, b.serviceId);
    await messageCustomer(business.id, b.customerId, `Good news: your ${service.name} at ${business.name} on ${formatDateTime(b.startsAt, business.timezone)} is confirmed.`);
  }
  return updated;
}

export async function bookingByToken(token: string) {
  const [row] = await db
    .select({ booking: schema.bookings, business: schema.businesses, service: schema.services, staff: schema.staff, customer: schema.customers })
    .from(schema.bookings)
    .innerJoin(schema.businesses, eq(schema.businesses.id, schema.bookings.businessId))
    .innerJoin(schema.services, eq(schema.services.id, schema.bookings.serviceId))
    .innerJoin(schema.staff, eq(schema.staff.id, schema.bookings.staffId))
    .innerJoin(schema.customers, eq(schema.customers.id, schema.bookings.customerId))
    .where(eq(schema.bookings.manageToken, token));
  return row ?? null;
}
