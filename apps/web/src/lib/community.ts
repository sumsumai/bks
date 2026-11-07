import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { forbidden, notFound } from "./errors";
import { entitlementsOf } from "./plans";
import { platformCan } from "./platform-rbac";
import type { Tenant } from "./tenant";

/** Members are businesses whose plan includes the community (VIP), plus platform moderators. */
export async function canAccessCommunity(t: Pick<Tenant, "business" | "user">) {
  return platformCan(t.user.platformRole, "community.moderate") || (await entitlementsOf(t.business)).community;
}

export async function assertCommunityAccess(t: Pick<Tenant, "business" | "user">) {
  if (!(await canAccessCommunity(t))) throw forbidden("The community is available to VIP businesses");
}

/** Moderators see hidden content, post in staff-only categories and reply in locked threads. */
export const isCommunityModerator = (u: { platformRole: string | null }) => platformCan(u.platformRole, "community.moderate");

export async function listCategories() {
  // Correlated subqueries reference the outer table by name: drizzle renders columns unqualified
  // in a single-table select, which would bind to the subquery's own table.
  const rows = await db
    .select({
      category: schema.forumCategories,
      threads: sql<number>`(select count(*)::int from forum_threads t where t.category_id = forum_categories.id and not t.hidden)`,
      lastActivity: sql<Date | null>`(select max(last_activity_at) from forum_threads t where t.category_id = forum_categories.id and not t.hidden)`,
    })
    .from(schema.forumCategories)
    .orderBy(asc(schema.forumCategories.sortOrder), asc(schema.forumCategories.name));
  return rows.map((r) => ({ ...r.category, threads: Number(r.threads), lastActivity: r.lastActivity ? new Date(r.lastActivity) : null }));
}

export async function getCategoryBySlug(slug: string) {
  const [c] = await db.select().from(schema.forumCategories).where(eq(schema.forumCategories.slug, slug));
  if (!c) throw notFound("Category");
  return c;
}

export async function listThreads(categoryId: string, opts: { includeHidden?: boolean } = {}) {
  return db
    .select({
      thread: schema.forumThreads,
      authorName: schema.users.name,
      businessName: schema.businesses.name,
      replies: sql<number>`(select count(*)::int from forum_posts p where p.thread_id = ${schema.forumThreads.id} and not p.hidden)`,
    })
    .from(schema.forumThreads)
    .innerJoin(schema.users, eq(schema.users.id, schema.forumThreads.authorUserId))
    .leftJoin(schema.businesses, eq(schema.businesses.id, schema.forumThreads.authorBusinessId))
    .where(and(eq(schema.forumThreads.categoryId, categoryId), opts.includeHidden ? undefined : eq(schema.forumThreads.hidden, false)))
    .orderBy(desc(schema.forumThreads.pinned), desc(schema.forumThreads.lastActivityAt))
    .then((rows) => rows.map((r) => ({ ...r.thread, authorName: r.authorName, businessName: r.businessName, replies: Number(r.replies) })));
}

export async function getThread(id: string, opts: { includeHidden?: boolean } = {}) {
  const [row] = await db
    .select({ thread: schema.forumThreads, category: schema.forumCategories, authorName: schema.users.name, businessName: schema.businesses.name })
    .from(schema.forumThreads)
    .innerJoin(schema.forumCategories, eq(schema.forumCategories.id, schema.forumThreads.categoryId))
    .innerJoin(schema.users, eq(schema.users.id, schema.forumThreads.authorUserId))
    .leftJoin(schema.businesses, eq(schema.businesses.id, schema.forumThreads.authorBusinessId))
    .where(eq(schema.forumThreads.id, id));
  if (!row || (row.thread.hidden && !opts.includeHidden)) throw notFound("Thread");
  const posts = await db
    .select({ post: schema.forumPosts, authorName: schema.users.name, businessName: schema.businesses.name })
    .from(schema.forumPosts)
    .innerJoin(schema.users, eq(schema.users.id, schema.forumPosts.authorUserId))
    .leftJoin(schema.businesses, eq(schema.businesses.id, schema.forumPosts.authorBusinessId))
    .where(and(eq(schema.forumPosts.threadId, id), opts.includeHidden ? undefined : eq(schema.forumPosts.hidden, false)))
    .orderBy(asc(schema.forumPosts.createdAt));
  return {
    ...row.thread,
    category: row.category,
    authorName: row.authorName,
    businessName: row.businessName,
    posts: posts.map((p) => ({ ...p.post, authorName: p.authorName, businessName: p.businessName })),
  };
}

export async function listOpenReports() {
  return db
    .select({
      report: schema.forumReports,
      reporter: schema.users.name,
      postBody: schema.forumPosts.body,
      postHidden: schema.forumPosts.hidden,
      threadTitle: schema.forumThreads.title,
      threadHidden: schema.forumThreads.hidden,
      threadIdOfPost: schema.forumPosts.threadId,
    })
    .from(schema.forumReports)
    .innerJoin(schema.users, eq(schema.users.id, schema.forumReports.reporterUserId))
    .leftJoin(schema.forumPosts, eq(schema.forumPosts.id, schema.forumReports.postId))
    .leftJoin(schema.forumThreads, eq(schema.forumThreads.id, schema.forumReports.threadId))
    .where(eq(schema.forumReports.resolved, false))
    .orderBy(desc(schema.forumReports.createdAt));
}

export async function recentThreadsForModeration(limit = 50) {
  return db
    .select({ thread: schema.forumThreads, category: schema.forumCategories.name, authorName: schema.users.name })
    .from(schema.forumThreads)
    .innerJoin(schema.forumCategories, eq(schema.forumCategories.id, schema.forumThreads.categoryId))
    .innerJoin(schema.users, eq(schema.users.id, schema.forumThreads.authorUserId))
    .orderBy(desc(schema.forumThreads.lastActivityAt))
    .limit(limit)
    .then((rows) => rows.map((r) => ({ ...r.thread, categoryName: r.category, authorName: r.authorName })));
}
