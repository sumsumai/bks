import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import { runMigrations } from "../db/migrate";
import { handleInbound } from "./agent/runtime";
import { createBusiness } from "./businesses";
import { assertStaffAllowed } from "./catalog";
import { newId } from "./ids";
import { entitlementsOf } from "./plans";
import { platformCan, ROLE_INFO } from "./platform-rbac";
import { clearSettings, describeSettings, getSettings, saveSettings } from "./settings";

process.env.AGENT_OFFLINE = "1";

before(runMigrations);

async function biz(tier = "standard") {
  const [owner] = await db.insert(schema.users).values({ id: newId("usr"), email: `${newId("usr")}@t.example`, name: "Owner", passwordHash: "x" }).returning();
  const b = await createBusiness(owner, { name: `Biz ${newId("biz")}`, category: "hair", city: "Paris", timezone: "Europe/Paris", currency: "EUR" });
  const [business] = await db.update(schema.businesses).set({ tier, published: true }).where(eq(schema.businesses.id, b.id)).returning();
  return business;
}

describe("platform settings", () => {
  test("database beats environment beats default; secrets are encrypted and masked", async () => {
    process.env.AGENT_MODEL = "claude-sonnet-5-5";
    await clearSettings(["ai.model", "ai.anthropicApiKey"]);
    assert.equal((await getSettings())["ai.model"], "claude-sonnet-5-5");
    await saveSettings({ "ai.model": "claude-haiku-5-5", "ai.anthropicApiKey": "sk-test-1234567890abcd" }, "usr_admin");
    const s = await getSettings();
    assert.equal(s["ai.model"], "claude-haiku-5-5");
    assert.equal(s["ai.anthropicApiKey"], "sk-test-1234567890abcd");
    const [row] = await db.select().from(schema.platformSettings).where(eq(schema.platformSettings.key, "ai.anthropicApiKey"));
    assert.ok(!String(row.value).includes("sk-test"), "secret stored encrypted");
    const described = (await describeSettings()).find((d) => d.key === "ai.anthropicApiKey")!;
    assert.equal(described.value, null);
    assert.equal(described.secretHint, "••••abcd");
    await assert.rejects(saveSettings({ "ai.model": "gpt-whatever" }, "usr_admin"));
    await clearSettings(["ai.model", "ai.anthropicApiKey"]);
    delete process.env.AGENT_MODEL;
    assert.equal((await getSettings())["ai.model"], "claude-opus-5-5");
  });
});

describe("plans", () => {
  test("seeded plans carry entitlements; VIP includes the community", async () => {
    assert.equal((await entitlementsOf({ tier: "vip" })).community, true);
    assert.equal((await entitlementsOf({ tier: "standard" })).community, false);
  });

  test("staff limit from the plan is enforced", async () => {
    const b = await biz();
    await db.update(schema.plans).set({ entitlements: { community: false, featured: false, maxStaff: 1, maxConversationsPerMonth: 1000, whatsapp: true, telegram: true } }).where(eq(schema.plans.id, "standard"));
    try {
      await assert.rejects(assertStaffAllowed(b), /up to 1 team members/); // the owner already counts
    } finally {
      await db.update(schema.plans).set({ entitlements: { community: false, featured: false, maxStaff: 5, maxConversationsPerMonth: 1000, whatsapp: true, telegram: true } }).where(eq(schema.plans.id, "standard"));
    }
  });

  test("monthly AI conversation allowance: the agent stops answering new conversations past the limit", async () => {
    await db.insert(schema.plans).values({ id: "tiny", name: "Tiny", entitlements: { community: false, featured: false, maxStaff: null, maxConversationsPerMonth: 2, whatsapp: true, telegram: true } }).onConflictDoNothing();
    const b = await biz("tiny");
    const r1 = await handleInbound({ business: b, channel: "web", threadId: "web:a", text: "hi", customer: null });
    const r2 = await handleInbound({ business: b, channel: "web", threadId: "web:b", text: "hi", customer: null });
    const r3 = await handleInbound({ business: b, channel: "web", threadId: "web:c", text: "hi", customer: null });
    assert.ok(r1.reply && r2.reply);
    assert.equal(r3.skipped, "quota");
    // Existing conversations keep being served.
    const r1b = await handleInbound({ business: b, channel: "web", threadId: "web:a", text: "again", customer: null });
    assert.ok(r1b.reply);
    const notes = await db.select().from(schema.notifications).where(eq(schema.notifications.businessId, b.id));
    assert.equal(notes.filter((n) => n.kind === "quota.reached").length, 1);
  });

  test("the global AI switch silences every agent", async () => {
    const b = await biz();
    await saveSettings({ "ai.enabled": false }, "usr_admin");
    try {
      const r = await handleInbound({ business: b, channel: "web", threadId: "web:z", text: "hello", customer: null });
      assert.equal(r.skipped, "agent_paused");
    } finally {
      await clearSettings(["ai.enabled"]);
    }
  });
});

describe("platform roles", () => {
  test("permissions per role", () => {
    assert.equal(platformCan("admin", "settings.manage"), true);
    assert.equal(platformCan("operator", "settings.manage"), false);
    assert.equal(platformCan("operator", "users.manage"), true);
    assert.equal(platformCan("support", "users.manage"), false);
    assert.equal(platformCan("support", "impersonate"), true);
    assert.equal(platformCan("finance", "plans.manage"), true);
    assert.equal(platformCan("moderator", "businesses.view"), false);
    assert.equal(platformCan(null, "overview.view"), false);
    assert.equal(ROLE_INFO.admin.permissions.length, 15);
  });
});
