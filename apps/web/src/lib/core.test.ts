import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { and, eq } from "drizzle-orm";
import { db, schema } from "../db";
import { runMigrations } from "../db/migrate";
import { decideAction } from "./agent/approvals";
import { executeToolCall, handleInbound } from "./agent/runtime";
import type { AgentContext } from "./agent/tools";
import { getSlots } from "./availability";
import { createBooking } from "./bookings";
import { createBusiness } from "./businesses";
import { AppError } from "./errors";
import { newId } from "./ids";
import { addDays, todayIn, tzOffsetMinutes, zonedParts, zonedToUtc } from "./time";

process.env.AGENT_OFFLINE = "1";

async function makeOwner(name: string) {
  const [u] = await db.insert(schema.users).values({ id: newId("usr"), email: `${newId("usr")}@test.example`, name, passwordHash: "x" }).returning();
  return u;
}

/** A business open every day 09:00–17:00 with one 60-minute service. */
async function makeBusiness(name: string) {
  const owner = await makeOwner(`${name} owner`);
  const b = await createBusiness(owner, { name, category: "hair", city: "Paris", timezone: "Europe/Paris", currency: "EUR" });
  const [staff] = await db.select().from(schema.staff).where(eq(schema.staff.businessId, b.id));
  await db.delete(schema.availabilityRules).where(eq(schema.availabilityRules.staffId, staff.id));
  await db.insert(schema.availabilityRules).values([0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ id: newId("avl"), businessId: b.id, staffId: staff.id, weekday, startMinute: 540, endMinute: 1020 })));
  const [svc] = await db.insert(schema.services).values({ id: newId("svc"), businessId: b.id, name: "Cut", durationMinutes: 60, priceCents: 5000 }).returning();
  const [business] = await db.update(schema.businesses).set({ published: true, policy: { ...b.policy, minNoticeMinutes: 0 } }).where(eq(schema.businesses.id, b.id)).returning();
  const [agent] = await db.select().from(schema.agents).where(eq(schema.agents.businessId, b.id));
  return { business, owner, staff, svc, agent };
}

const tomorrow = (tz: string) => addDays(todayIn(tz), 1);

before(async () => {
  await runMigrations();
});

describe("time", () => {
  test("zonedToUtc handles DST in Europe/Paris", () => {
    assert.equal(zonedToUtc("2026-01-15", 600, "Europe/Paris").toISOString(), "2026-01-15T09:00:00.000Z");
    assert.equal(zonedToUtc("2026-07-15", 600, "Europe/Paris").toISOString(), "2026-07-15T08:00:00.000Z");
    assert.equal(tzOffsetMinutes(new Date("2026-07-15T08:00:00Z"), "America/New_York"), -240);
    assert.deepEqual(zonedParts(new Date("2026-07-15T08:00:00Z"), "Europe/Paris"), { date: "2026-07-15", weekday: 3, minute: 600 });
  });
});

describe("availability and bookings", () => {
  test("a booked slot disappears from availability", async () => {
    const { business, svc } = await makeBusiness("Slots Co");
    const date = tomorrow(business.timezone);
    const before = await getSlots(business, { serviceId: svc.id, date });
    assert.equal(before.length, 29); // 09:00 … 16:00 every 15 min
    await createBooking(business, { serviceId: svc.id, startsAt: before[4].startsAt, customer: { name: "A", email: "a@x.io" }, source: "web" }, { type: "customer" });
    const after = await getSlots(business, { serviceId: svc.id, date });
    // 10:00–11:00 booked: starts 09:15 … 10:45 now overlap.
    assert.equal(after.length, before.length - 7);
  });

  test("concurrent requests for the same slot: exactly one wins", async () => {
    const { business, svc } = await makeBusiness("Race Co");
    const date = tomorrow(business.timezone);
    const [slot] = await getSlots(business, { serviceId: svc.id, date });
    const attempts = await Promise.allSettled(
      Array.from({ length: 5 }, (_, i) =>
        createBooking(business, { serviceId: svc.id, startsAt: slot.startsAt, customer: { name: `C${i}`, email: `c${i}@x.io` }, source: "web" }, { type: "customer" }),
      ),
    );
    assert.equal(attempts.filter((a) => a.status === "fulfilled").length, 1);
    for (const a of attempts.filter((a) => a.status === "rejected")) assert.equal(((a as PromiseRejectedResult).reason as AppError).status, 409);
  });

  test("the database refuses overlapping bookings even when the app check is bypassed", async () => {
    const { business, svc, staff } = await makeBusiness("Constraint Co");
    const startsAt = zonedToUtc(tomorrow(business.timezone), 600, business.timezone);
    await createBooking(business, { serviceId: svc.id, staffId: staff.id, startsAt, customer: { name: "A", email: "a@x.io" }, source: "owner", override: true }, { type: "user" });
    await assert.rejects(
      createBooking(business, { serviceId: svc.id, staffId: staff.id, startsAt: new Date(startsAt.getTime() + 30 * 60_000), customer: { name: "B", email: "b@x.io" }, source: "owner", override: true }, { type: "user" }),
      (e: AppError) => e.code === "slot_taken",
    );
  });
});

describe("agent isolation and approvals", () => {
  function ctxFor(x: Awaited<ReturnType<typeof makeBusiness>>, customer: schema.Customer | null, conversation: schema.Conversation): AgentContext {
    return { business: x.business, agent: x.agent, conversation, customer, setCustomer: async () => {} };
  }

  async function conversation(businessId: string, customerId: string | null) {
    const [c] = await db.insert(schema.conversations).values({ id: newId("cnv"), businessId, channel: "web", externalThreadId: newId("cnv"), customerId }).returning();
    return c;
  }

  test("an agent cannot touch another business's or another customer's booking", async () => {
    const a = await makeBusiness("Tenant A");
    const b = await makeBusiness("Tenant B");
    const slotB = (await getSlots(b.business, { serviceId: b.svc.id, date: tomorrow(b.business.timezone) }))[0];
    const { booking: bookingB, customer: custB } = await createBooking(b.business, { serviceId: b.svc.id, startsAt: slotB.startsAt, customer: { name: "Bob", email: "bob@x.io" }, source: "web" }, { type: "customer" });

    // Agent A, even if told B's booking id, cannot reschedule it.
    const [custA] = await db.insert(schema.customers).values({ id: newId("cus"), businessId: a.business.id, name: "Alice" }).returning();
    const ctxA = ctxFor(a, custA, await conversation(a.business.id, custA.id));
    const r1 = await executeToolCall(ctxA, "reschedule_booking", { booking_id: bookingB.id, new_starts_at: slotB.startsAt });
    assert.equal(r1.isError, true);

    // Within B, a different customer cannot cancel Bob's booking either (cancel is auto here for the test).
    await db.update(schema.agents).set({ permissions: { ...b.agent.permissions, cancel_booking: "auto" } }).where(eq(schema.agents.id, b.agent.id));
    const agentB = (await db.select().from(schema.agents).where(eq(schema.agents.id, b.agent.id)))[0];
    const [mallory] = await db.insert(schema.customers).values({ id: newId("cus"), businessId: b.business.id, name: "Mallory" }).returning();
    const r2 = await executeToolCall({ ...ctxFor(b, mallory, await conversation(b.business.id, mallory.id)), agent: agentB }, "cancel_booking", { booking_id: bookingB.id });
    assert.equal(r2.isError, true);
    const [still] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, bookingB.id));
    assert.equal(still.status, "confirmed");

    // Knowledge search never returns another tenant's documents.
    await db.insert(schema.knowledgeItems).values({ id: newId("kno"), businessId: b.business.id, kind: "faq", title: "Secret parking", content: "Tenant B parking code 4242" });
    const r3 = await executeToolCall(ctxA, "search_knowledge", { query: "parking code" });
    assert.ok(!JSON.stringify(r3.result).includes("4242"));
    void custB;
  });

  test("approval-gated tools queue, execute once on approval, and refuse a second decision", async () => {
    const x = await makeBusiness("Approvals Co");
    const slot = (await getSlots(x.business, { serviceId: x.svc.id, date: tomorrow(x.business.timezone) }))[3];
    const { booking, customer } = await createBooking(x.business, { serviceId: x.svc.id, startsAt: slot.startsAt, customer: { name: "Cara", email: "cara@x.io" }, source: "web" }, { type: "customer" });
    await db.update(schema.businesses).set({ policy: { ...x.business.policy, cancellationWindowHours: 0 } }).where(eq(schema.businesses.id, x.business.id));
    const business = (await db.select().from(schema.businesses).where(eq(schema.businesses.id, x.business.id)))[0];
    const conv = await conversation(business.id, customer.id);

    const r = await executeToolCall({ ...ctxFor(x, customer, conv), business }, "cancel_booking", { booking_id: booking.id, reason: "sick" });
    assert.equal((r.result as { status: string }).status, "pending_approval");
    const [pending] = await db.select().from(schema.agentActions).where(and(eq(schema.agentActions.businessId, business.id), eq(schema.agentActions.status, "pending_approval")));
    assert.ok(pending);
    assert.equal((await db.select().from(schema.bookings).where(eq(schema.bookings.id, booking.id)))[0].status, "confirmed");

    await decideAction(business, pending.id, true, x.owner.id);
    assert.equal((await db.select().from(schema.bookings).where(eq(schema.bookings.id, booking.id)))[0].status, "cancelled");
    await assert.rejects(decideAction(business, pending.id, true, x.owner.id), (e: AppError) => e.code === "already_decided");

    // Another business cannot decide this action.
    const other = await makeBusiness("Other Co");
    await assert.rejects(decideAction(other.business, pending.id, false, other.owner.id), (e: AppError) => e.status === 404);
  });

  test("inbound messages are idempotent and human takeover silences the agent", async () => {
    const x = await makeBusiness("Inbox Co");
    const first = await handleInbound({ business: x.business, channel: "telegram", threadId: "t1", text: "hello", externalMessageId: "m1", customer: null });
    assert.ok(first.reply);
    const dup = await handleInbound({ business: x.business, channel: "telegram", threadId: "t1", text: "hello", externalMessageId: "m1", customer: null });
    assert.equal(dup.skipped, "duplicate");
    await db.update(schema.conversations).set({ humanTakeover: true }).where(eq(schema.conversations.id, first.conversationId));
    const muted = await handleInbound({ business: x.business, channel: "telegram", threadId: "t1", text: "anyone?", externalMessageId: "m2", customer: null });
    assert.equal(muted.skipped, "human_takeover");
  });
});
