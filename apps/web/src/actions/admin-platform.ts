"use server";

import { and, count, eq, ne, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/actions/workspace";
import { db, schema } from "@/db";
import { ADMIN_RETURN_COOKIE, assertPlatform, createSession, currentUser, SESSION_COOKIE } from "@/lib/auth";
import { applyTier } from "@/lib/billing";
import { deepLink, registerTelegramWebhook, resetTelegramCache, telegramDeleteWebhook, telegramGetMe, telegramSetProfile } from "@/lib/channels/telegram";
import { waLogout, waRestart } from "@/lib/channels/whatsapp";
import { hashPassword, randomToken, sha256 } from "@/lib/crypto";
import { AppError } from "@/lib/errors";
import { audit } from "@/lib/events";
import { newId, slugify } from "@/lib/ids";
import { DEFAULT_ENTITLEMENTS, getPlan } from "@/lib/plans";
import { isPlatformRole } from "@/lib/platform-rbac";
import { describeSettings, getSettings, saveSettings, settingDef } from "@/lib/settings";
import { ACTIVE_BUSINESS_COOKIE } from "@/lib/tenant";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const on = (f: FormData, k: string) => f.get(k) === "on" || f.get(k) === "true";

async function attempt(fn: () => Promise<string | void>): Promise<ActionState> {
  try {
    const message = await fn();
    return { ok: true, message: message || "Saved" };
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e) throw e; // redirect()
    if (e instanceof AppError) return { error: e.message };
    if (e instanceof z.ZodError) return { error: e.issues.map((i) => `${i.path.join(".") || "value"}: ${i.message}`).join("; ") };
    return { error: e instanceof Error ? e.message : "Something went wrong" };
  }
}

// ---------------------------------------------------------------- Platform settings

/**
 * Save one settings group. Each field is named after its setting key. Secrets left blank keep their
 * current value; a "clear:<key>" checkbox resets a key to the environment/default value.
 */
export async function saveSettingsAction(_prev: ActionState, f: FormData): Promise<ActionState> {
  const admin = await assertPlatform("settings.manage");
  return attempt(async () => {
    const keys = s(f, "_keys").split(",").filter(Boolean);
    const values: Record<string, unknown> = {};
    for (const key of keys) {
      const def = settingDef(key);
      if (!def) continue;
      if (on(f, `clear:${key}`)) values[key] = null;
      else if (def.kind === "boolean") values[key] = on(f, key);
      else if (def.kind === "secret") {
        const v = s(f, key);
        if (v) values[key] = v;
      } else values[key] = s(f, key);
    }
    if ("general.appUrl" in values && values["general.appUrl"]) {
      const url = String(values["general.appUrl"]).replace(/\/$/, "");
      if (!/^https?:\/\/[^\s/]+/.test(url)) throw new AppError(400, "bad_request", "Public URL must start with http:// or https://");
      values["general.appUrl"] = url;
    }
    const saved = await saveSettings(values, admin.id);
    await audit(null, { type: "user", id: admin.id }, "admin.settings_saved", saved.join(","), { keys: saved });
    revalidatePath("/admin", "layout");
    return "Settings saved. They apply within a few seconds.";
  });
}

// ---------------------------------------------------------------- Telegram bot

/** Validate and save the shared bot token, generate a webhook secret, and register the webhook if possible. */
export async function saveTelegramBot(_prev: ActionState, f: FormData): Promise<ActionState> {
  const admin = await assertPlatform("channels.manage");
  return attempt(async () => {
    const token = s(f, "botToken");
    if (!/^\d+:[\w-]{30,}$/.test(token)) throw new AppError(400, "bad_request", "That doesn't look like a bot token from @BotFather");
    const me = await telegramGetMe(token).catch((e) => {
      throw new AppError(400, "bad_request", `Telegram rejected the token: ${e.message}`);
    });
    const current = await getSettings();
    await saveSettings(
      { "telegram.botToken": token, "telegram.botUsername": me.username, ...(current["telegram.webhookSecret"] ? {} : { "telegram.webhookSecret": randomToken(24) }) },
      admin.id,
    );
    resetTelegramCache();
    await refreshTelegramLinks(me.username);
    await audit(null, { type: "user", id: admin.id }, "admin.telegram_bot_set", me.username);
    let webhook = "";
    try {
      const r = await registerTelegramWebhook();
      webhook = ` Webhook registered at ${r.url}.`;
    } catch (e) {
      webhook = ` Webhook not registered yet: ${e instanceof Error ? e.message : e}`;
    }
    revalidatePath("/admin/telegram");
    return `Connected @${me.username}.${webhook}`;
  });
}

async function refreshTelegramLinks(username: string) {
  const rows = await db
    .select({ channelId: schema.channels.id, slug: schema.businesses.slug })
    .from(schema.channels)
    .innerJoin(schema.businesses, eq(schema.businesses.id, schema.channels.businessId))
    .where(and(eq(schema.channels.kind, "telegram"), eq(schema.channels.status, "connected")));
  for (const r of rows) await db.update(schema.channels).set({ publicHandle: await deepLink(r.slug), displayName: `@${username}` }).where(eq(schema.channels.id, r.channelId));
}

export async function registerTelegramWebhookAction(_prev: ActionState, _f: FormData): Promise<ActionState> {
  const admin = await assertPlatform("channels.manage");
  return attempt(async () => {
    const r = await registerTelegramWebhook();
    await audit(null, { type: "user", id: admin.id }, "admin.telegram_webhook", r.url);
    revalidatePath("/admin/telegram");
    return `@${r.bot} now delivers to ${r.url}`;
  });
}

export async function rotateTelegramSecret(_prev: ActionState, _f: FormData): Promise<ActionState> {
  const admin = await assertPlatform("channels.manage");
  return attempt(async () => {
    await saveSettings({ "telegram.webhookSecret": randomToken(24) }, admin.id);
    const r = await registerTelegramWebhook();
    await audit(null, { type: "user", id: admin.id }, "admin.telegram_secret_rotated");
    revalidatePath("/admin/telegram");
    return `Secret rotated and webhook re-registered at ${r.url}`;
  });
}

export async function saveTelegramProfile(_prev: ActionState, f: FormData): Promise<ActionState> {
  const admin = await assertPlatform("channels.manage");
  return attempt(async () => {
    const p = z
      .object({ name: z.string().max(64), description: z.string().max(512), shortDescription: z.string().max(120) })
      .parse({ name: s(f, "name"), description: s(f, "description"), shortDescription: s(f, "shortDescription") });
    await telegramSetProfile(p);
    await audit(null, { type: "user", id: admin.id }, "admin.telegram_profile");
    revalidatePath("/admin/telegram");
    return "Bot profile updated in Telegram";
  });
}

/** Stop using the bot: delete the webhook and forget the token. Business links stop working. */
export async function disconnectTelegramBot(_prev: ActionState, _f: FormData): Promise<ActionState> {
  const admin = await assertPlatform("channels.manage");
  return attempt(async () => {
    await telegramDeleteWebhook().catch(() => {});
    await saveSettings({ "telegram.botToken": null, "telegram.botUsername": null }, admin.id);
    resetTelegramCache();
    await audit(null, { type: "user", id: admin.id }, "admin.telegram_bot_removed");
    revalidatePath("/admin/telegram");
    return "Bot disconnected";
  });
}

// ---------------------------------------------------------------- WhatsApp gateway sessions

export async function whatsappSessionAction(f: FormData) {
  const admin = await assertPlatform("channels.manage");
  const businessId = s(f, "businessId");
  const action = s(f, "action");
  if (action === "restart") await waRestart(businessId).catch((e) => console.error("[admin] wa restart", e));
  if (action === "unlink") {
    await waLogout(businessId).catch((e) => console.error("[admin] wa logout", e));
    await db
      .update(schema.channels)
      .set({ status: "disconnected", pairing: null, lastError: "Unlinked by the platform team" })
      .where(and(eq(schema.channels.businessId, businessId), eq(schema.channels.kind, "whatsapp")));
  }
  await audit(businessId, { type: "user", id: admin.id }, `admin.whatsapp_${action}`, businessId);
  revalidatePath("/admin/whatsapp");
}

// ---------------------------------------------------------------- Plans & pricing

const PlanInput = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,30}$/, "Use 2–31 lowercase letters, digits or dashes"),
  name: z.string().trim().min(1).max(40),
  description: z.string().max(300),
  priceCents: z.number().int().min(0).max(100_000_000),
  currency: z.string().regex(/^[A-Z]{3}$/),
  interval: z.enum(["month", "year"]),
  features: z.array(z.string().trim().min(1).max(120)).max(20),
  trialDays: z.number().int().min(0).max(365),
  stripePriceId: z.string().max(100).nullable(),
  active: z.boolean(),
  public: z.boolean(),
  highlighted: z.boolean(),
  sortOrder: z.number().int().min(0).max(1000),
  entitlements: z.object({
    community: z.boolean(),
    featured: z.boolean(),
    maxStaff: z.number().int().min(1).max(10_000).nullable(),
    maxConversationsPerMonth: z.number().int().min(0).max(10_000_000).nullable(),
    whatsapp: z.boolean(),
    telegram: z.boolean(),
  }),
});

const optInt = (v: string) => (v === "" ? null : Math.round(Number(v)));

export async function savePlan(_prev: ActionState, f: FormData): Promise<ActionState> {
  const admin = await assertPlatform("plans.manage");
  return attempt(async () => {
    const existingId = s(f, "existingId");
    const input = PlanInput.parse({
      id: existingId || slugify(s(f, "id") || s(f, "name")),
      name: s(f, "name"),
      description: s(f, "description"),
      priceCents: Math.round(Number(s(f, "price").replace(",", ".") || 0) * 100),
      currency: s(f, "currency").toUpperCase() || "EUR",
      interval: s(f, "interval") || "month",
      features: s(f, "features").split("\n").map((x) => x.trim()).filter(Boolean),
      trialDays: Math.round(Number(s(f, "trialDays") || 0)),
      stripePriceId: s(f, "stripePriceId") || null,
      active: on(f, "active"),
      public: on(f, "public"),
      highlighted: on(f, "highlighted"),
      sortOrder: Math.round(Number(s(f, "sortOrder") || 0)),
      entitlements: {
        community: on(f, "ent.community"),
        featured: on(f, "ent.featured"),
        maxStaff: optInt(s(f, "ent.maxStaff")),
        maxConversationsPerMonth: optInt(s(f, "ent.maxConversationsPerMonth")),
        whatsapp: on(f, "ent.whatsapp"),
        telegram: on(f, "ent.telegram"),
      },
    });
    if (existingId) {
      const { id: _id, ...rest } = input;
      await db.update(schema.plans).set(rest).where(eq(schema.plans.id, existingId));
    } else {
      const [dup] = await db.select({ id: schema.plans.id }).from(schema.plans).where(eq(schema.plans.id, input.id));
      if (dup) throw new AppError(409, "conflict", `A plan with id "${input.id}" already exists`);
      await db.insert(schema.plans).values(input);
    }
    if (input.highlighted) await db.update(schema.plans).set({ highlighted: false }).where(ne(schema.plans.id, input.id));
    await audit(null, { type: "user", id: admin.id }, existingId ? "admin.plan_updated" : "admin.plan_created", input.id, { priceCents: input.priceCents, entitlements: input.entitlements });
    revalidatePath("/admin/plans");
    revalidatePath("/", "layout");
    return existingId ? `${input.name} updated. Existing subscribers get the new limits now; price changes apply to new Stripe checkouts.` : `${input.name} created`;
  });
}

export async function deletePlan(f: FormData) {
  const admin = await assertPlatform("plans.manage");
  const id = s(f, "id");
  const [{ n }] = await db.select({ n: count() }).from(schema.businesses).where(eq(schema.businesses.tier, id));
  if (Number(n) > 0) {
    // In use: archive instead of deleting.
    await db.update(schema.plans).set({ active: false, public: false }).where(eq(schema.plans.id, id));
    await audit(null, { type: "user", id: admin.id }, "admin.plan_archived", id);
  } else {
    await db.delete(schema.subscriptions).where(eq(schema.subscriptions.tier, id));
    await db.delete(schema.plans).where(eq(schema.plans.id, id));
    await audit(null, { type: "user", id: admin.id }, "admin.plan_deleted", id);
  }
  revalidatePath("/admin/plans");
}

export async function newPlanDefaults() {
  return { ...DEFAULT_ENTITLEMENTS, maxStaff: 5, maxConversationsPerMonth: 1000 };
}

// ---------------------------------------------------------------- Users

const Email = z.email("Enter a valid email").max(200);

export async function createUser(_prev: ActionState, f: FormData): Promise<ActionState> {
  const admin = await assertPlatform("users.manage");
  return attempt(async () => {
    const name = z.string().trim().min(1, "Name is required").max(80).parse(s(f, "name"));
    const email = Email.parse(s(f, "email").toLowerCase());
    const [dup] = await db.select({ id: schema.users.id }).from(schema.users).where(sql`lower(${schema.users.email}) = ${email}`);
    if (dup) throw new AppError(409, "conflict", "A user with this email already exists");
    const password = s(f, "password") || randomToken(9);
    if (password.length < 8) throw new AppError(400, "bad_request", "Password must be at least 8 characters");
    const role = s(f, "platformRole");
    if (role) await assertPlatform("staff.manage");
    const id = newId("usr");
    await db.insert(schema.users).values({ id, email, name, passwordHash: await hashPassword(password), platformRole: isPlatformRole(role) ? role : null });
    let businessId = s(f, "businessId");
    const ref = s(f, "businessRef");
    if (!businessId && ref) {
      const [b] = await db.select({ id: schema.businesses.id }).from(schema.businesses).where(sql`${schema.businesses.slug} = ${ref} or ${schema.businesses.id} = ${ref}`);
      if (!b) throw new AppError(404, "not_found", `No business "${ref}"`);
      businessId = b.id;
    }
    if (businessId) await db.insert(schema.memberships).values({ businessId, userId: id, role: (s(f, "businessRole") as "owner" | "manager" | "staff") || "staff" }).onConflictDoNothing();
    await audit(businessId || null, { type: "user", id: admin.id }, "admin.user_created", id, { email, role: role || null });
    revalidatePath("/admin/users");
    return `Created ${email}.${s(f, "password") ? "" : ` Temporary password: ${password}`}`;
  });
}

export async function updateUser(_prev: ActionState, f: FormData): Promise<ActionState> {
  const admin = await assertPlatform("users.manage");
  return attempt(async () => {
    const id = s(f, "userId");
    const name = z.string().trim().min(1).max(80).parse(s(f, "name"));
    const email = Email.parse(s(f, "email").toLowerCase());
    const [dup] = await db.select({ id: schema.users.id }).from(schema.users).where(and(sql`lower(${schema.users.email}) = ${email}`, ne(schema.users.id, id)));
    if (dup) throw new AppError(409, "conflict", "Another user already has this email");
    await db.update(schema.users).set({ name, email }).where(eq(schema.users.id, id));
    await audit(null, { type: "user", id: admin.id }, "admin.user_updated", id);
    revalidatePath(`/admin/users/${id}`);
    return "Saved";
  });
}

export async function resetUserPassword(_prev: ActionState, f: FormData): Promise<ActionState> {
  const admin = await assertPlatform("users.manage");
  return attempt(async () => {
    const id = s(f, "userId");
    const password = s(f, "password") || randomToken(9);
    if (password.length < 8) throw new AppError(400, "bad_request", "Password must be at least 8 characters");
    await db.update(schema.users).set({ passwordHash: await hashPassword(password) }).where(eq(schema.users.id, id));
    await db.delete(schema.sessions).where(eq(schema.sessions.userId, id));
    await audit(null, { type: "user", id: admin.id }, "admin.password_reset", id);
    return s(f, "password") ? "Password changed and all sessions signed out" : `New temporary password: ${password} (all sessions signed out). Share it securely.`;
  });
}

export async function revokeUserSessions(f: FormData) {
  const admin = await assertPlatform("users.manage");
  const id = s(f, "userId");
  await db.delete(schema.sessions).where(eq(schema.sessions.userId, id));
  await audit(null, { type: "user", id: admin.id }, "admin.sessions_revoked", id);
  revalidatePath(`/admin/users/${id}`);
}

export async function setPlatformRole(f: FormData) {
  const admin = await assertPlatform("staff.manage");
  const id = s(f, "userId");
  if (id === admin.id) throw new AppError(400, "bad_request", "You can't change your own platform role");
  const role = s(f, "role");
  const platformRole = isPlatformRole(role) ? role : null;
  if (!platformRole) {
    const [target] = await db.select({ r: schema.users.platformRole }).from(schema.users).where(eq(schema.users.id, id));
    if (target?.r === "admin") {
      const [{ n }] = await db.select({ n: count() }).from(schema.users).where(and(eq(schema.users.platformRole, "admin"), eq(schema.users.disabled, false)));
      if (Number(n) <= 1) throw new AppError(400, "bad_request", "Keep at least one administrator");
    }
  }
  await db.update(schema.users).set({ platformRole }).where(eq(schema.users.id, id));
  // Role changes take effect immediately: end their sessions.
  await db.delete(schema.sessions).where(eq(schema.sessions.userId, id));
  await audit(null, { type: "user", id: admin.id }, platformRole ? "admin.role_granted" : "admin.role_revoked", id, { role: platformRole });
  revalidatePath("/admin/users", "layout");
  revalidatePath("/admin/access");
}

/** Grant platform access to an existing user by email (Access page). */
export async function grantAccessByEmail(_prev: ActionState, f: FormData): Promise<ActionState> {
  const admin = await assertPlatform("staff.manage");
  return attempt(async () => {
    const email = Email.parse(s(f, "email").toLowerCase());
    const role = s(f, "role");
    if (!isPlatformRole(role)) throw new AppError(400, "bad_request", "Pick a role");
    const [u] = await db.select().from(schema.users).where(sql`lower(${schema.users.email}) = ${email}`);
    if (!u) throw new AppError(404, "not_found", "No user with this email. Create them in Users first.");
    if (u.id === admin.id) throw new AppError(400, "bad_request", "You can't change your own platform role");
    await db.update(schema.users).set({ platformRole: role }).where(eq(schema.users.id, u.id));
    await db.delete(schema.sessions).where(eq(schema.sessions.userId, u.id));
    await audit(null, { type: "user", id: admin.id }, "admin.role_granted", u.id, { role });
    revalidatePath("/admin/access");
    return `${u.name} is now ${role}`;
  });
}

// ---------------------------------------------------------------- Memberships

const BusinessRole = z.enum(["owner", "manager", "staff"]);

export async function addMembership(_prev: ActionState, f: FormData): Promise<ActionState> {
  const admin = await assertPlatform("users.manage");
  return attempt(async () => {
    let userId = s(f, "userId");
    const email = s(f, "email").toLowerCase();
    if (!userId && email) {
      const [u] = await db.select({ id: schema.users.id }).from(schema.users).where(sql`lower(${schema.users.email}) = ${email}`);
      if (!u) throw new AppError(404, "not_found", "No user with this email. Create them in Users first.");
      userId = u.id;
    }
    let businessId = s(f, "businessId");
    const ref = s(f, "business");
    if (!businessId && ref) {
      const [b] = await db.select({ id: schema.businesses.id }).from(schema.businesses).where(sql`${schema.businesses.slug} = ${ref} or ${schema.businesses.id} = ${ref}`);
      businessId = b?.id ?? "";
    }
    if (!businessId) throw new AppError(404, "not_found", "Business not found (use its slug or id)");
    const role = BusinessRole.parse(s(f, "role"));
    await db
      .insert(schema.memberships)
      .values({ businessId, userId, role })
      .onConflictDoUpdate({ target: [schema.memberships.businessId, schema.memberships.userId], set: { role } });
    await audit(businessId, { type: "user", id: admin.id }, "admin.member_added", userId, { role });
    revalidatePath(`/admin/users/${userId}`);
    revalidatePath(`/admin/businesses/${businessId}`);
    return "Membership saved";
  });
}

export async function updateMembership(f: FormData) {
  const admin = await assertPlatform("users.manage");
  const userId = s(f, "userId");
  const businessId = s(f, "businessId");
  const action = s(f, "action");
  const [m] = await db.select().from(schema.memberships).where(and(eq(schema.memberships.userId, userId), eq(schema.memberships.businessId, businessId)));
  if (!m) return;
  if (m.role === "owner" && (action === "remove" || s(f, "role") !== "owner")) {
    const [{ n }] = await db.select({ n: count() }).from(schema.memberships).where(and(eq(schema.memberships.businessId, businessId), eq(schema.memberships.role, "owner")));
    if (Number(n) <= 1) throw new AppError(400, "bad_request", "A business needs at least one owner. Add another owner first.");
  }
  if (action === "remove") {
    await db.delete(schema.memberships).where(and(eq(schema.memberships.userId, userId), eq(schema.memberships.businessId, businessId)));
    await audit(businessId, { type: "user", id: admin.id }, "admin.member_removed", userId);
  } else {
    const role = BusinessRole.parse(s(f, "role"));
    await db.update(schema.memberships).set({ role }).where(and(eq(schema.memberships.userId, userId), eq(schema.memberships.businessId, businessId)));
    await audit(businessId, { type: "user", id: admin.id }, "admin.member_role", userId, { role });
  }
  revalidatePath(`/admin/users/${userId}`);
  revalidatePath(`/admin/businesses/${businessId}`);
}

// ---------------------------------------------------------------- Businesses

export async function updateBusinessAdmin(_prev: ActionState, f: FormData): Promise<ActionState> {
  const admin = await assertPlatform("businesses.manage");
  return attempt(async () => {
    const id = s(f, "businessId");
    const name = z.string().trim().min(1).max(80).parse(s(f, "name"));
    const slug = slugify(s(f, "slug"));
    if (slug.length < 2) throw new AppError(400, "bad_request", "Slug is too short");
    const [dup] = await db.select({ id: schema.businesses.id }).from(schema.businesses).where(and(eq(schema.businesses.slug, slug), ne(schema.businesses.id, id)));
    if (dup) throw new AppError(409, "conflict", "This slug is taken");
    const [b] = await db.update(schema.businesses).set({ name, slug, category: s(f, "category") || "other", city: s(f, "city") }).where(eq(schema.businesses.id, id)).returning();
    const { refreshTelegramLink } = await import("@/lib/channels");
    await refreshTelegramLink(b).catch(() => {});
    await audit(id, { type: "user", id: admin.id }, "admin.business_updated", id, { slug });
    revalidatePath(`/admin/businesses/${id}`);
    return "Saved";
  });
}

export async function updateSubscriptionAdmin(_prev: ActionState, f: FormData): Promise<ActionState> {
  const admin = await assertPlatform("billing.manage");
  return attempt(async () => {
    const businessId = s(f, "businessId");
    const plan = await getPlan(s(f, "tier"));
    const status = z.enum(["trialing", "active", "past_due", "canceled"]).parse(s(f, "status"));
    const end = s(f, "periodEnd");
    const currentPeriodEnd = end ? new Date(`${end}T23:59:59Z`) : null;
    const [b] = await db.select({ tier: schema.businesses.tier }).from(schema.businesses).where(eq(schema.businesses.id, businessId));
    if (b && b.tier !== plan.id) await applyTier(businessId, plan.id, { status, currentPeriodEnd }, { type: "user", id: admin.id });
    else
      await db
        .insert(schema.subscriptions)
        .values({ businessId, tier: plan.id, status, currentPeriodEnd })
        .onConflictDoUpdate({ target: schema.subscriptions.businessId, set: { status, currentPeriodEnd, updatedAt: new Date() } });
    await audit(businessId, { type: "user", id: admin.id }, "admin.subscription_updated", businessId, { tier: plan.id, status, end });
    revalidatePath(`/admin/businesses/${businessId}`);
    revalidatePath("/admin/payments");
    return "Subscription updated";
  });
}

// ---------------------------------------------------------------- Sign in as a user

/**
 * Open the workspace as another user, for support. The admin's own session is kept aside and restored
 * by stopImpersonating(). Impersonation sessions last 1 hour, never carry platform powers, and every
 * start/stop is audited.
 */
export async function impersonate(f: FormData) {
  const admin = await assertPlatform("impersonate");
  const userId = s(f, "userId");
  const [target] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!target || target.disabled) throw new AppError(404, "not_found", "User not found or disabled");
  if (target.id === admin.id) throw new AppError(400, "bad_request", "That's you");
  if (isPlatformRole(target.platformRole)) await assertPlatform("staff.manage");
  const jar = await cookies();
  const own = jar.get(SESSION_COOKIE)?.value;
  if (!own) throw new AppError(401, "unauthorized", "Sign in again");
  const { token, expiresAt } = await createSession(target.id, "web", { impersonatorId: admin.id, ttlHours: 1 });
  const opts = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/" };
  jar.set(ADMIN_RETURN_COOKIE, own, { ...opts, expires: expiresAt });
  jar.set(SESSION_COOKIE, token, { ...opts, expires: expiresAt });
  jar.delete(ACTIVE_BUSINESS_COOKIE);
  await audit(null, { type: "user", id: admin.id }, "admin.impersonation_started", target.id, { email: target.email });
  redirect("/app");
}

export async function stopImpersonating() {
  const jar = await cookies();
  const user = await currentUser();
  const current = jar.get(SESSION_COOKIE)?.value;
  const back = jar.get(ADMIN_RETURN_COOKIE)?.value;
  if (current && user?.impersonatorId) {
    await db.delete(schema.sessions).where(eq(schema.sessions.tokenHash, sha256(current)));
    await audit(null, { type: "user", id: user.impersonatorId }, "admin.impersonation_ended", user.id);
  }
  const opts = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/" };
  jar.delete(ADMIN_RETURN_COOKIE);
  jar.delete(ACTIVE_BUSINESS_COOKIE);
  if (back) jar.set(SESSION_COOKIE, back, { ...opts, expires: new Date(Date.now() + 30 * 86400_000) });
  else jar.delete(SESSION_COOKIE);
  redirect(back ? "/admin/users" : "/login");
}

export async function settingsSnapshotForAdmin() {
  await assertPlatform("settings.manage");
  return describeSettings();
}
