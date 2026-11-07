"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { provisionAgent } from "@/lib/agent/provision";
import { assertPlatform } from "@/lib/auth";
import { applyTier } from "@/lib/billing";
import { getPlan } from "@/lib/plans";
import { badRequest, notFound } from "@/lib/errors";
import { audit, notifyBusiness } from "@/lib/events";
import { newId, slugify } from "@/lib/ids";
import { isPlatformRole } from "@/lib/platform-rbac";

const str = (form: FormData, k: string) => String(form.get(k) ?? "");

async function loadBusiness(id: string) {
  const [b] = await db.select().from(schema.businesses).where(eq(schema.businesses.id, id));
  if (!b) throw notFound("Business");
  return b;
}

// ---------------------------------------------------------------------------
// Businesses
// ---------------------------------------------------------------------------

export async function adminSetTier(form: FormData) {
  const admin = await assertPlatform("billing.manage");
  const b = await loadBusiness(str(form, "businessId"));
  const tier = (await getPlan(str(form, "tier"))).id;
  await applyTier(b.id, tier, { status: "active" }, { type: "user", id: admin.id });
  await audit(b.id, { type: "user", id: admin.id }, "admin.tier_changed", b.id, { tier });
  revalidatePath(`/admin/businesses/${b.id}`);
  revalidatePath("/admin/businesses");
}

export async function adminSetSuspended(form: FormData) {
  const admin = await assertPlatform("businesses.manage");
  const b = await loadBusiness(str(form, "businessId"));
  const suspended = str(form, "suspended") === "true";
  await db.update(schema.businesses).set({ suspended }).where(eq(schema.businesses.id, b.id));
  await audit(b.id, { type: "user", id: admin.id }, suspended ? "admin.suspended" : "admin.unsuspended", b.id);
  if (suspended) await notifyBusiness(b.id, { kind: "business.suspended", title: "Your business has been suspended", body: "Bookings and your agent are paused. Contact support for details." });
  revalidatePath(`/admin/businesses/${b.id}`);
  revalidatePath("/admin/businesses");
}

export async function adminSetPublished(form: FormData) {
  const admin = await assertPlatform("businesses.manage");
  const b = await loadBusiness(str(form, "businessId"));
  const published = str(form, "published") === "true";
  await db.update(schema.businesses).set({ published }).where(eq(schema.businesses.id, b.id));
  await audit(b.id, { type: "user", id: admin.id }, published ? "admin.published" : "admin.unpublished", b.id);
  revalidatePath(`/admin/businesses/${b.id}`);
  revalidatePath("/admin/businesses");
}

export async function adminSetAgentStatus(form: FormData) {
  const admin = await assertPlatform("agents.manage");
  const b = await loadBusiness(str(form, "businessId"));
  const status = str(form, "status") === "paused" ? "paused" : "active";
  const [agent] = await db.update(schema.agents).set({ status }).where(eq(schema.agents.businessId, b.id)).returning();
  if (!agent) throw notFound("Agent");
  await audit(b.id, { type: "user", id: admin.id }, status === "paused" ? "admin.agent_paused" : "admin.agent_resumed", agent.id);
  revalidatePath(`/admin/businesses/${b.id}`);
  revalidatePath("/admin/agents");
}

export async function adminProvisionAgent(form: FormData) {
  const admin = await assertPlatform("agents.manage");
  const b = await loadBusiness(str(form, "businessId"));
  const agent = await provisionAgent(b, { actorUserId: admin.id });
  await audit(b.id, { type: "user", id: admin.id }, "admin.agent_provisioned", agent?.id);
  revalidatePath(`/admin/businesses/${b.id}`);
  revalidatePath("/admin/agents");
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export async function adminSetUserDisabled(form: FormData) {
  const admin = await assertPlatform("users.manage");
  const userId = str(form, "userId");
  if (userId === admin.id) throw badRequest("You can't disable your own account");
  const disabled = str(form, "disabled") === "true";
  await db.update(schema.users).set({ disabled }).where(eq(schema.users.id, userId));
  if (disabled) await db.delete(schema.sessions).where(eq(schema.sessions.userId, userId));
  await audit(null, { type: "user", id: admin.id }, disabled ? "admin.user_disabled" : "admin.user_enabled", userId);
  revalidatePath("/admin/users");
}

export async function adminSetUserAdmin(form: FormData) {
  const admin = await assertPlatform("staff.manage");
  const userId = str(form, "userId");
  if (userId === admin.id) throw badRequest("You can't change your own platform role");
  const role = str(form, "role") || (str(form, "admin") === "true" ? "admin" : "");
  const platformRole = isPlatformRole(role) ? role : null;
  await db.update(schema.users).set({ platformRole }).where(eq(schema.users.id, userId));
  await audit(null, { type: "user", id: admin.id }, platformRole ? "admin.role_granted" : "admin.role_revoked", userId, { role: platformRole });
  revalidatePath("/admin/users");
}

// ---------------------------------------------------------------------------
// Community moderation
// ---------------------------------------------------------------------------

const Category = z.object({
  name: z.string().trim().min(1).max(80),
  slug: z.string().trim().max(60).optional(),
  description: z.string().max(500).default(""),
  sortOrder: z.coerce.number().int().min(0).max(1000).default(0),
});

export async function adminSaveCategory(form: FormData) {
  const admin = await assertPlatform("community.moderate");
  const id = str(form, "id");
  const input = Category.parse({ name: form.get("name"), slug: form.get("slug") || undefined, description: form.get("description") ?? "", sortOrder: form.get("sortOrder") || 0 });
  const values = { name: input.name, slug: slugify(input.slug || input.name) || newId("fcat"), description: input.description, sortOrder: input.sortOrder, adminOnlyPosting: form.get("adminOnlyPosting") === "on" };
  if (id) await db.update(schema.forumCategories).set(values).where(eq(schema.forumCategories.id, id));
  else await db.insert(schema.forumCategories).values({ id: newId("fcat"), ...values });
  await audit(null, { type: "user", id: admin.id }, id ? "admin.category_updated" : "admin.category_created", id || values.slug);
  revalidatePath("/admin/community");
  revalidatePath("/app/community");
}

export async function adminDeleteCategory(form: FormData) {
  const admin = await assertPlatform("community.moderate");
  const id = str(form, "id");
  await db.delete(schema.forumCategories).where(eq(schema.forumCategories.id, id));
  await audit(null, { type: "user", id: admin.id }, "admin.category_deleted", id);
  revalidatePath("/admin/community");
  revalidatePath("/app/community");
}

export async function adminResolveReport(form: FormData) {
  const admin = await assertPlatform("community.moderate");
  const id = str(form, "id");
  await db.update(schema.forumReports).set({ resolved: true }).where(eq(schema.forumReports.id, id));
  await audit(null, { type: "user", id: admin.id }, "admin.report_resolved", id);
  revalidatePath("/admin/community");
}

export async function adminModeratePost(form: FormData) {
  const admin = await assertPlatform("community.moderate");
  const id = str(form, "id");
  const hidden = str(form, "hidden") === "true";
  const [post] = await db.update(schema.forumPosts).set({ hidden }).where(eq(schema.forumPosts.id, id)).returning();
  if (!post) throw notFound("Post");
  if (hidden) await db.update(schema.forumReports).set({ resolved: true }).where(and(eq(schema.forumReports.postId, id), eq(schema.forumReports.resolved, false)));
  await audit(null, { type: "user", id: admin.id }, hidden ? "admin.post_hidden" : "admin.post_unhidden", id);
  revalidatePath("/admin/community");
  revalidatePath(`/app/community/t/${post.threadId}`);
}

export async function adminModerateThread(form: FormData) {
  const admin = await assertPlatform("community.moderate");
  const id = str(form, "id");
  const field = str(form, "field");
  const value = str(form, "value") === "true";
  if (!["hidden", "pinned", "locked"].includes(field)) throw badRequest("Unknown field");
  const [thread] = await db
    .update(schema.forumThreads)
    .set({ [field]: value } as Partial<typeof schema.forumThreads.$inferInsert>)
    .where(eq(schema.forumThreads.id, id))
    .returning();
  if (!thread) throw notFound("Thread");
  if (field === "hidden" && value) await db.update(schema.forumReports).set({ resolved: true }).where(and(eq(schema.forumReports.threadId, id), eq(schema.forumReports.resolved, false)));
  await audit(null, { type: "user", id: admin.id }, `admin.thread_${field}_${value ? "on" : "off"}`, id);
  revalidatePath("/admin/community");
  revalidatePath(`/app/community/t/${id}`);
  revalidatePath("/app/community", "layout");
}

export async function adminPostAnnouncement(form: FormData) {
  const admin = await assertPlatform("community.moderate");
  const title = z.string().trim().min(3).max(160).parse(form.get("title"));
  const body = z.string().trim().min(1).max(20_000).parse(form.get("body"));
  const categoryId = str(form, "categoryId");
  const [cat] = await db.select().from(schema.forumCategories).where(eq(schema.forumCategories.id, categoryId));
  if (!cat) throw notFound("Category");
  const id = newId("thr");
  await db.insert(schema.forumThreads).values({ id, categoryId: cat.id, authorUserId: admin.id, title, body, pinned: form.get("pinned") === "on" });
  if (form.get("notify") === "on") {
    const vips = await db
      .select({ id: schema.businesses.id })
      .from(schema.businesses)
      .innerJoin(schema.plans, eq(schema.plans.id, schema.businesses.tier))
      .where(sql`(${schema.plans.entitlements}->>'community')::boolean`);
    for (const v of vips) await notifyBusiness(v.id, { kind: "community.announcement", title: `Announcement: ${title}`, body: body.slice(0, 140), href: `/app/community/t/${id}` });
  }
  await audit(null, { type: "user", id: admin.id }, "admin.announcement_posted", id);
  revalidatePath("/admin/community");
  revalidatePath("/app/community", "layout");
}
