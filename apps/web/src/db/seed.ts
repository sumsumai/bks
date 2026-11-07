/* Demo data: a platform admin, three businesses (one VIP), services, staff, hours, knowledge,
 * a few bookings and conversations, and the VIP community. Safe to run on an empty database only. */
import { sql } from "drizzle-orm";
import { db, schema } from "./index";
import { runMigrations } from "./migrate";
import { hashPassword, randomToken } from "../lib/crypto";
import { newId } from "../lib/ids";
import { addDays, todayIn, zonedToUtc } from "../lib/time";

const PASSWORD = "demo-password";

async function user(email: string, name: string, admin = false) {
  const [u] = await db
    .insert(schema.users)
    .values({ id: newId("usr"), email, name, passwordHash: await hashPassword(PASSWORD), platformRole: admin ? "admin" : null })
    .returning();
  return u;
}

type Svc = { name: string; description: string; minutes: number; price: number; category?: string };

async function business(
  owner: schema.User,
  b: { name: string; slug: string; tagline: string; description: string; category: string; city: string; tz: string; color: string; tier: "standard" | "vip"; cover: string },
  staffDefs: { name: string; title: string; bio: string; color: string; days: number[]; start: number; end: number }[],
  svcs: Svc[],
  knowledge: { kind: "faq" | "policy" | "document" | "note"; title: string; content: string }[],
  persona: Partial<schema.AgentPersona>,
  instructions: string,
) {
  const id = newId("biz");
  const [biz] = await db
    .insert(schema.businesses)
    .values({
      id,
      slug: b.slug,
      name: b.name,
      tagline: b.tagline,
      description: b.description,
      category: b.category,
      city: b.city,
      timezone: b.tz,
      currency: "EUR",
      brandColor: b.color,
      coverUrl: b.cover,
      tier: b.tier,
      published: true,
      phone: "+33 1 23 45 67 89",
      email: `hello@${b.slug}.example`,
      onboardingStep: 9,
      policy: { ...schema.DEFAULT_POLICY, policyText: "Late arrivals over 15 minutes may need to be rescheduled." },
    })
    .returning();
  await db.insert(schema.memberships).values({ businessId: id, userId: owner.id, role: "owner" });
  await db.insert(schema.subscriptions).values({ businessId: id, tier: b.tier, status: "active", provider: "test", currentPeriodEnd: new Date(Date.now() + 30 * 86400_000) });
  const locId = newId("loc");
  await db.insert(schema.locations).values({ id: locId, businessId: id, name: "Main location", address: b.city });
  const staffIds: string[] = [];
  for (const s of staffDefs) {
    const sid = newId("stf");
    staffIds.push(sid);
    await db.insert(schema.staff).values({ id: sid, businessId: id, name: s.name, title: s.title, bio: s.bio, color: s.color, locationId: locId });
    await db.insert(schema.availabilityRules).values(s.days.map((weekday) => ({ id: newId("avl"), businessId: id, staffId: sid, weekday, startMinute: s.start * 60, endMinute: s.end * 60 })));
  }
  const serviceIds: string[] = [];
  for (const [i, s] of svcs.entries()) {
    const sid = newId("svc");
    serviceIds.push(sid);
    await db.insert(schema.services).values({ id: sid, businessId: id, name: s.name, description: s.description, durationMinutes: s.minutes, priceCents: s.price * 100, sortOrder: i, category: s.category ?? "" });
  }
  for (const k of knowledge) await db.insert(schema.knowledgeItems).values({ id: newId("kno"), businessId: id, ...k });

  const { provisionAgent } = await import("../lib/agent/provision");
  const agent = await provisionAgent(biz, { persona, actorUserId: owner.id });
  await db.update(schema.agents).set({ instructions }).where(sql`${schema.agents.id} = ${agent.id}`);

  // Customers, bookings and a couple of conversations so dashboards aren't empty.
  const names = ["Léa Martin", "Hugo Bernard", "Chloé Petit", "Lucas Moreau", "Inès Laurent", "Nathan Simon", "Camille Michel", "Jules Garcia"];
  const customers: schema.Customer[] = [];
  for (const [i, n] of names.entries()) {
    const [c] = await db
      .insert(schema.customers)
      .values({ id: newId("cus"), businessId: id, name: n, email: `${n.split(" ")[0].toLowerCase()}.${i}@example.com`, phone: `+3361234${String(5600 + i)}` })
      .returning();
    customers.push(c);
  }
  const today = todayIn(b.tz);
  let k = 0;
  for (let d = -12; d <= 6; d++) {
    const date = addDays(today, d);
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    for (const [si, s] of staffDefs.entries()) {
      if (!s.days.includes(weekday)) continue;
      for (const hour of [s.start + 1, s.start + 4].filter((h) => h < s.end - 1)) {
        if ((d + si + hour) % 3 === 0) continue;
        const svcIdx = (k + si) % svcs.length;
        const svc = svcs[svcIdx];
        const startsAt = zonedToUtc(date, hour * 60, b.tz);
        const status = d < 0 ? (k % 9 === 0 ? "no_show" : k % 7 === 0 ? "cancelled" : "completed") : "confirmed";
        await db.insert(schema.bookings).values({
          id: newId("bkg"),
          businessId: id,
          customerId: customers[k % customers.length].id,
          serviceId: serviceIds[svcIdx],
          staffId: staffIds[si],
          locationId: locId,
          startsAt,
          endsAt: new Date(startsAt.getTime() + svc.minutes * 60_000),
          status,
          source: (["web", "agent", "whatsapp", "telegram", "owner"] as const)[k % 5],
          priceCents: svc.price * 100,
          paymentStatus: status === "completed" ? "paid" : "unpaid",
          manageToken: randomToken(18),
        });
        k++;
      }
    }
  }
  const conv1 = newId("cnv");
  await db.insert(schema.conversations).values({ id: conv1, businessId: id, customerId: customers[0].id, channel: "whatsapp", externalThreadId: "33612345600" });
  await db.insert(schema.messages).values([
    { id: newId("msg"), businessId: id, conversationId: conv1, role: "customer", content: `Hi! Do you have anything free Saturday morning for a ${svcs[0].name.toLowerCase()}?` },
    { id: newId("msg"), businessId: id, conversationId: conv1, role: "agent", content: `Hi ${customers[0].name.split(" ")[0]}! Saturday I have 10:00 or 11:30 with ${staffDefs[0].name}. Which works best?` },
    { id: newId("msg"), businessId: id, conversationId: conv1, role: "customer", content: "10:00 please 🙏" },
    { id: newId("msg"), businessId: id, conversationId: conv1, role: "agent", content: `Done: you're booked Saturday at 10:00 with ${staffDefs[0].name}. See you then!` },
  ]);
  const conv2 = newId("cnv");
  await db.insert(schema.conversations).values({ id: conv2, businessId: id, customerId: customers[3].id, channel: "telegram", externalThreadId: "880011", status: "escalated", humanTakeover: true, escalationReason: "Customer is unhappy with their last visit and asks for a refund" });
  await db.insert(schema.messages).values([
    { id: newId("msg"), businessId: id, conversationId: conv2, role: "customer", content: "I wasn't happy with my last appointment, I'd like a refund." },
    { id: newId("msg"), businessId: id, conversationId: conv2, role: "agent", content: "I'm sorry to hear that. I've passed this to the team and someone will reply here shortly." },
  ]);
  await db.insert(schema.agentActions).values({
    id: newId("act"),
    businessId: id,
    agentId: agent.id,
    conversationId: conv1,
    tool: "cancel_booking",
    input: { booking_id: "bkg_demo", reason: "Customer is travelling" },
    status: "pending_approval",
    summary: "Cancel booking on Friday 14:00 (Customer is travelling)",
  });
  await db.insert(schema.usageEvents).values(
    Array.from({ length: 40 }, (_, i) => ({ id: newId("use"), businessId: id, kind: "agent_turn" as const, inputTokens: 3200 + i * 10, outputTokens: 180 + i, latencyMs: 1800 + (i % 7) * 230, createdAt: new Date(Date.now() - i * 13 * 3600_000) })),
  );
  await db.insert(schema.notifications).values([
    { id: newId("ntf"), businessId: id, kind: "approval.requested", title: "Approval needed", body: "Cancel booking on Friday 14:00", href: "/app/approvals" },
    { id: newId("ntf"), businessId: id, kind: "conversation.escalated", title: "A customer needs you", body: "Refund request", href: `/app/inbox/${conv2}` },
  ]);
  return biz;
}

/**
 * Insert demo businesses, owners and community content into an EMPTY database.
 * `admin`: an existing platform admin to author community posts; when omitted, the demo admin
 * admin@bks.example (password demo-password) is created, which is fine locally but not on a public site.
 */
export async function seedDemo(opts: { admin?: schema.User } = {}) {
  const [{ count }] = (await db.execute(sql`select count(*)::int as count from businesses`)).rows as { count: number }[];
  if (Number(count) > 0) {
    console.log("Database already has businesses; skipping demo data.");
    return false;
  }
  const admin = opts.admin ?? (await user("admin@bks.example", "Platform Admin", true));
  const maya = await user("owner@atelier.example", "Maya Laurent");
  const tom = await user("owner@ironhouse.example", "Tom Reyes");
  const ana = await user("owner@lumen.example", "Ana Costa");

  const weekdays = [2, 3, 4, 5, 6];
  await business(
    maya,
    {
      name: "Atelier Nord",
      slug: "atelier-nord",
      tagline: "Modern hair studio in the heart of the Marais",
      description: "A calm, light-filled studio for precision cuts, lived-in colour and treatments. Organic products, espresso on arrival.",
      category: "hair",
      city: "Paris",
      tz: "Europe/Paris",
      color: "#1f2937",
      tier: "vip",
      cover: "https://images.unsplash.com/photo-1560066984-138dadb4c035?w=1600&q=80",
    },
    [
      { name: "Maya Laurent", title: "Founder & Creative Director", bio: "15 years of colour work between Paris and London.", color: "#8b5cf6", days: weekdays, start: 9, end: 19 },
      { name: "Sami Haddad", title: "Senior Stylist", bio: "Precision cuts and texture specialist.", color: "#0ea5e9", days: [1, 2, 3, 4, 5], start: 10, end: 19 },
    ],
    [
      { name: "Signature cut & finish", description: "Consultation, wash, precision cut and blow-dry.", minutes: 60, price: 85 },
      { name: "Balayage", description: "Hand-painted lived-in colour, toner and finish.", minutes: 180, price: 240 },
      { name: "Gloss & tone", description: "Refresh shine and tone between colour appointments.", minutes: 45, price: 65 },
      { name: "Restorative treatment", description: "Bond-building mask and scalp massage.", minutes: 30, price: 45 },
    ],
    [
      { kind: "faq", title: "Parking", content: "Paid street parking on Rue de Bretagne; the nearest garage is Parking Saint-Martin (5 min walk)." },
      { kind: "faq", title: "Products", content: "We use organic, vegan colour and care products. Patch tests are free and required 48h before a first colour service." },
      { kind: "policy", title: "Deposits", content: "Colour services over €150 require a 30% deposit, refundable up to 48h before." },
      { kind: "faq", title: "Children", content: "Kids' cuts (under 12) are €35 with Sami on weekdays." },
    ],
    { tone: "luxury", formality: "formal", greeting: "Bonjour and welcome to Atelier Nord.", signature: "— Atelier Nord" },
    "Always suggest a patch test for first-time colour clients. If someone asks for Maya specifically on a Saturday, offer Sami as an alternative if she's full.",
  );
  await business(
    tom,
    {
      name: "Ironhouse Barbers",
      slug: "ironhouse-barbers",
      tagline: "Classic cuts, hot towel shaves, no fuss",
      description: "Neighbourhood barbershop. Walk-ins when we can, bookings recommended on weekends.",
      category: "barber",
      city: "Lyon",
      tz: "Europe/Paris",
      color: "#b45309",
      tier: "standard",
      cover: "https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=1600&q=80",
    },
    [{ name: "Tom Reyes", title: "Master Barber", bio: "Fades, scissor work and traditional shaves.", color: "#f59e0b", days: [1, 2, 3, 4, 5, 6], start: 9, end: 18 }],
    [
      { name: "Haircut", description: "Clipper or scissor cut, wash and style.", minutes: 30, price: 28 },
      { name: "Beard trim", description: "Shape-up with hot towel.", minutes: 20, price: 18 },
      { name: "Cut & beard", description: "The full service.", minutes: 50, price: 42 },
      { name: "Hot towel shave", description: "Traditional straight-razor shave.", minutes: 40, price: 35 },
    ],
    [{ kind: "faq", title: "Payment", content: "Card and cash accepted. No cheques." }],
    { tone: "playful", formality: "casual", emoji: true, greeting: "Hey! Ironhouse here 💈" },
    "",
  );
  await business(
    ana,
    {
      name: "Lumen Spa",
      slug: "lumen-spa",
      tagline: "Massage and skin rituals by the sea",
      description: "Day spa offering massage, facials and wellness rituals. Robes, tea and a quiet lounge included.",
      category: "spa",
      city: "Nice",
      tz: "Europe/Paris",
      color: "#0f766e",
      tier: "vip",
      cover: "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=1600&q=80",
    },
    [
      { name: "Ana Costa", title: "Lead Therapist", bio: "Deep tissue and lymphatic drainage.", color: "#14b8a6", days: [1, 2, 3, 4, 5], start: 10, end: 20 },
      { name: "Elise Morel", title: "Facialist", bio: "Clinical and holistic facials.", color: "#ec4899", days: [3, 4, 5, 6, 0], start: 10, end: 19 },
    ],
    [
      { name: "Signature massage (60 min)", description: "Full-body massage tailored to you.", minutes: 60, price: 95 },
      { name: "Deep tissue (90 min)", description: "Targeted work on tension and recovery.", minutes: 90, price: 135 },
      { name: "Radiance facial", description: "Cleanse, exfoliation, mask and massage.", minutes: 75, price: 110 },
    ],
    [
      { kind: "policy", title: "Health", content: "Please tell us about pregnancy, injuries or medical conditions before your massage. We may ask you to consult your doctor first." },
      { kind: "faq", title: "Gift cards", content: "Gift cards are available at reception and by phone, valid 12 months." },
    ],
    { tone: "warm", formality: "neutral", greeting: "Hello and welcome to Lumen Spa ✨", emoji: true },
    "Never give medical advice. For pregnancy or injuries, recommend speaking with the team before booking.",
  );

  // VIP community
  const cats = [
    { slug: "announcements", name: "Announcements", description: "News and exclusive content from the platform team.", adminOnlyPosting: true },
    { slug: "growth", name: "Growth & marketing", description: "Getting more clients, reviews, pricing." },
    { slug: "ai-agents", name: "AI agents", description: "Prompts, knowledge bases and automations that work." },
    { slug: "operations", name: "Operations", description: "Staff, scheduling, no-shows and tools." },
  ];
  const catIds: Record<string, string> = {};
  for (const [i, c] of cats.entries()) {
    const id = newId("fcat");
    catIds[c.slug] = id;
    await db.insert(schema.forumCategories).values({ id, sortOrder: i, adminOnlyPosting: false, ...c });
  }
  const t1 = newId("thr");
  await db.insert(schema.forumThreads).values({
    id: t1,
    categoryId: catIds.announcements,
    authorUserId: admin.id,
    title: "Welcome to the VIP community",
    body: "This is a private space for VIP businesses. Share what works, ask anything, and get early access to new agent features. Be kind; moderators keep it useful.",
    pinned: true,
  });
  const t2 = newId("thr");
  await db.insert(schema.forumThreads).values({
    id: t2,
    categoryId: catIds["ai-agents"],
    authorUserId: maya.id,
    title: "How we cut no-shows by 40% with agent reminders",
    body: "We let the agent send a reminder 24h before and asked it to offer a reschedule link instead of cancelling. Clients reschedule instead of ghosting. Happy to share our instructions.",
  });
  await db.insert(schema.forumPosts).values({ id: newId("pst"), threadId: t2, authorUserId: ana.id, body: "Same experience at the spa. We also added our deposit policy to the knowledge base so the agent explains it up front." });

  console.log(`Seeded. Sign in with any of these (password: ${PASSWORD}):
  admin@bks.example         platform admin
  owner@atelier.example     Atelier Nord (VIP)
  owner@ironhouse.example   Ironhouse Barbers (Standard)
  owner@lumen.example       Lumen Spa (VIP)`);
  return true;
}

async function main() {
  await runMigrations();
  await seedDemo();
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => {
  console.error(e);
  process.exit(1);
});
