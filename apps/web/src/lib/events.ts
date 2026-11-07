import "server-only";
import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { newId } from "./ids";

export type Actor = { type: "user" | "agent" | "customer" | "system"; id?: string | null };

export async function audit(businessId: string | null, actor: Actor, action: string, target?: string, data?: Record<string, unknown>) {
  // While platform staff are signed in as a user, tag every action with who really did it.
  if (actor.type === "user") {
    try {
      const { currentUser } = await import("./auth");
      const u = await currentUser();
      if (u?.impersonatorId && u.id === actor.id) data = { ...data, impersonatedBy: u.impersonatorId };
    } catch {
      /* outside a request (webhooks, jobs, tests) */
    }
  }
  await db.insert(schema.auditLog).values({
    id: newId("aud"),
    businessId,
    actorType: actor.type,
    actorId: actor.id ?? null,
    action,
    target: target ?? null,
    data: data ?? null,
  });
}

/** In-app notification for a business's team + mobile push to every member's registered devices. */
export async function notifyBusiness(
  businessId: string,
  n: { kind: string; title: string; body?: string; href?: string },
) {
  await db.insert(schema.notifications).values({
    id: newId("ntf"),
    businessId,
    kind: n.kind,
    title: n.title,
    body: n.body ?? "",
    href: n.href ?? null,
  });
  void sendPush(businessId, n).catch((e) => console.error("[push]", e));
}

async function sendPush(businessId: string, n: { kind: string; title: string; body?: string; href?: string }) {
  const members = await db
    .select({ userId: schema.memberships.userId })
    .from(schema.memberships)
    .where(eq(schema.memberships.businessId, businessId));
  if (!members.length) return;
  const tokens = await db
    .select()
    .from(schema.pushTokens)
    .where(inArray(schema.pushTokens.userId, members.map((m) => m.userId)));
  if (!tokens.length) return;
  // Expo push service: works for both iOS (APNs) and Android (FCM) via Expo push tokens.
  await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(
      tokens.map((t) => ({
        to: t.token,
        title: n.title,
        body: n.body,
        sound: "default",
        data: { kind: n.kind, href: n.href, businessId },
      })),
    ),
  });
}
