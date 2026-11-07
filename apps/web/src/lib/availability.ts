import "server-only";
import { and, eq, gt, inArray, isNull, lt, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { notFound } from "./errors";
import { addDays, minutesToHHMM, todayIn, weekdayOf, zonedToUtc } from "./time";

export type Slot = {
  startsAt: string; // ISO UTC
  time: string; // HH:MM local
  staffIds: string[];
};

type Interval = { start: number; end: number }; // epoch ms

const overlaps = (a: Interval, b: Interval) => a.start < b.end && b.start < a.end;

/** Staff who can perform a service. A service with no explicit assignment can be done by any active staff. */
export async function eligibleStaff(businessId: string, serviceId: string) {
  const all = await db
    .select()
    .from(schema.staff)
    .where(and(eq(schema.staff.businessId, businessId), eq(schema.staff.active, true)))
    .orderBy(schema.staff.createdAt);
  const links = await db.select().from(schema.serviceStaff).where(eq(schema.serviceStaff.serviceId, serviceId));
  if (!links.length) return all;
  const ids = new Set(links.map((l) => l.staffId));
  return all.filter((s) => ids.has(s.id));
}

export async function getService(businessId: string, serviceId: string) {
  const [svc] = await db
    .select()
    .from(schema.services)
    .where(and(eq(schema.services.id, serviceId), eq(schema.services.businessId, businessId)));
  if (!svc) throw notFound("Service");
  return svc;
}

/**
 * Bookable start times for one service on one local date.
 * `excludeBookingId` lets a reschedule ignore the booking being moved.
 */
export async function getSlots(
  business: schema.Business,
  opts: { serviceId: string; date: string; staffId?: string | null; excludeBookingId?: string; ignoreNotice?: boolean },
): Promise<Slot[]> {
  const service = await getService(business.id, opts.serviceId);
  if (!service.active) return [];
  let staffList = await eligibleStaff(business.id, service.id);
  if (opts.staffId) staffList = staffList.filter((s) => s.id === opts.staffId);
  if (!staffList.length) return [];

  const tz = business.timezone;
  const policy = business.policy;
  const now = Date.now();
  const earliest = opts.ignoreNotice ? now : now + policy.minNoticeMinutes * 60_000;
  const latestDate = addDays(todayIn(tz), policy.maxAdvanceDays);
  if (opts.date > latestDate || opts.date < todayIn(tz)) return [];

  const dayStart = zonedToUtc(opts.date, 0, tz);
  const dayEnd = zonedToUtc(addDays(opts.date, 1), 0, tz);
  const staffIds = staffList.map((s) => s.id);
  const weekday = weekdayOf(opts.date);

  const [rules, busy, off] = await Promise.all([
    db
      .select()
      .from(schema.availabilityRules)
      .where(
        and(
          eq(schema.availabilityRules.businessId, business.id),
          inArray(schema.availabilityRules.staffId, staffIds),
          eq(schema.availabilityRules.weekday, weekday),
        ),
      ),
    db
      .select({ id: schema.bookings.id, staffId: schema.bookings.staffId, startsAt: schema.bookings.startsAt, endsAt: schema.bookings.endsAt })
      .from(schema.bookings)
      .where(
        and(
          eq(schema.bookings.businessId, business.id),
          inArray(schema.bookings.staffId, staffIds),
          inArray(schema.bookings.status, ["pending", "confirmed"]),
          lt(schema.bookings.startsAt, dayEnd),
          gt(schema.bookings.endsAt, dayStart),
        ),
      ),
    db
      .select()
      .from(schema.timeOff)
      .where(
        and(
          eq(schema.timeOff.businessId, business.id),
          or(isNull(schema.timeOff.staffId), inArray(schema.timeOff.staffId, staffIds)),
          lt(schema.timeOff.startsAt, dayEnd),
          gt(schema.timeOff.endsAt, dayStart),
        ),
      ),
  ]);

  const step = Math.max(5, policy.slotIntervalMinutes);
  const blockMinutes = service.durationMinutes + service.bufferMinutes;
  const byTime = new Map<number, string[]>();

  for (const s of staffList) {
    const blocked: Interval[] = [
      ...busy
        .filter((b) => b.staffId === s.id && b.id !== opts.excludeBookingId)
        .map((b) => ({ start: b.startsAt.getTime(), end: b.endsAt.getTime() })),
      ...off.filter((o) => !o.staffId || o.staffId === s.id).map((o) => ({ start: o.startsAt.getTime(), end: o.endsAt.getTime() })),
    ];
    for (const r of rules.filter((r) => r.staffId === s.id)) {
      for (let m = r.startMinute; m + service.durationMinutes <= r.endMinute; m += step) {
        const start = zonedToUtc(opts.date, m, tz).getTime();
        if (start < earliest) continue;
        const iv = { start, end: start + blockMinutes * 60_000 };
        if (blocked.some((b) => overlaps(iv, b))) continue;
        const list = byTime.get(m) ?? [];
        list.push(s.id);
        byTime.set(m, list);
      }
    }
  }

  return [...byTime.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([m, ids]) => ({ startsAt: zonedToUtc(opts.date, m, tz).toISOString(), time: minutesToHHMM(m), staffIds: ids }));
}

/** First days (from `fromDate`) that have at least one slot. Used by the agent and the booking page. */
export async function nextAvailableDays(
  business: schema.Business,
  opts: { serviceId: string; staffId?: string | null; fromDate?: string; maxDays?: number; wantDays?: number },
) {
  const from = opts.fromDate ?? todayIn(business.timezone);
  const out: { date: string; slots: Slot[] }[] = [];
  const maxDays = Math.min(opts.maxDays ?? 21, business.policy.maxAdvanceDays + 1);
  for (let i = 0; i < maxDays && out.length < (opts.wantDays ?? 3); i++) {
    const date = addDays(from, i);
    const slots = await getSlots(business, { serviceId: opts.serviceId, date, staffId: opts.staffId });
    if (slots.length) out.push({ date, slots });
  }
  return out;
}
