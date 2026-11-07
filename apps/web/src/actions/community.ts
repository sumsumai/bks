"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { assertCommunityAccess, isCommunityModerator } from "@/lib/community";
import { forbidden, notFound } from "@/lib/errors";
import { newId } from "@/lib/ids";
import { currentTenant } from "@/lib/tenant";

async function member() {
  const t = await currentTenant();
  await assertCommunityAccess(t);
  return t;
}

const NewThread = z.object({
  categoryId: z.string().min(1),
  title: z.string().trim().min(3).max(160),
  body: z.string().trim().min(1).max(20_000),
});

export async function createThread(form: FormData) {
  const t = await member();
  const input = NewThread.parse(Object.fromEntries(form));
  const [cat] = await db.select().from(schema.forumCategories).where(eq(schema.forumCategories.id, input.categoryId));
  if (!cat) throw notFound("Category");
  if (cat.adminOnlyPosting && !isCommunityModerator(t.user)) throw forbidden("Only the platform team posts here");
  const id = newId("thr");
  await db.insert(schema.forumThreads).values({
    id,
    categoryId: cat.id,
    authorUserId: t.user.id,
    authorBusinessId: t.business.id,
    title: input.title,
    body: input.body,
  });
  revalidatePath("/app/community");
  redirect(`/app/community/t/${id}`);
}

export async function replyToThread(form: FormData) {
  const t = await member();
  const threadId = String(form.get("threadId") ?? "");
  const body = z.string().trim().min(1).max(20_000).parse(form.get("body"));
  const [thread] = await db.select().from(schema.forumThreads).where(eq(schema.forumThreads.id, threadId));
  if (!thread || thread.hidden) throw notFound("Thread");
  if (thread.locked && !isCommunityModerator(t.user)) throw forbidden("This thread is locked");
  await db.insert(schema.forumPosts).values({ id: newId("pst"), threadId, authorUserId: t.user.id, authorBusinessId: t.business.id, body });
  await db.update(schema.forumThreads).set({ lastActivityAt: new Date() }).where(eq(schema.forumThreads.id, threadId));
  revalidatePath(`/app/community/t/${threadId}`);
}

export async function reportContent(form: FormData) {
  const t = await member();
  const postId = (form.get("postId") as string) || null;
  const threadId = (form.get("threadId") as string) || null;
  const reason = z.string().trim().min(1).max(500).catch("Reported by a member").parse(form.get("reason") ?? "Reported by a member");
  if (postId) {
    const [p] = await db.select({ id: schema.forumPosts.id }).from(schema.forumPosts).where(eq(schema.forumPosts.id, postId));
    if (!p) throw notFound("Post");
  }
  // One open report per member per item.
  const [existing] = await db
    .select({ id: schema.forumReports.id })
    .from(schema.forumReports)
    .where(
      and(
        eq(schema.forumReports.reporterUserId, t.user.id),
        eq(schema.forumReports.resolved, false),
        postId ? eq(schema.forumReports.postId, postId) : eq(schema.forumReports.threadId, threadId ?? ""),
      ),
    );
  if (!existing) {
    await db.insert(schema.forumReports).values({ id: newId("rpt"), postId: postId, threadId: postId ? null : threadId, reporterUserId: t.user.id, reason });
  }
  if (threadId) revalidatePath(`/app/community/t/${threadId}`);
}
