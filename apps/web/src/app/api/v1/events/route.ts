import { and, eq, gt } from "drizzle-orm";
import { db, schema } from "@/db";
import { userFromRequest } from "@/lib/auth";
import { problem } from "@/lib/api";
import { resolveTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

/**
 * Server-Sent Events: live notifications for the workspace and the mobile app.
 * Polls the tenant's notifications table; swap for LISTEN/NOTIFY or a pub/sub when scaling out.
 */
export async function GET(req: Request) {
  let businessId: string;
  try {
    const user = await userFromRequest(req);
    const url = new URL(req.url);
    const t = await resolveTenant(user, req.headers.get("x-business-id") ?? url.searchParams.get("businessId") ?? /(?:^|;\s*)bks_biz=([^;]+)/.exec(req.headers.get("cookie") ?? "")?.[1]);
    businessId = t.business.id;
  } catch {
    return problem(401, "unauthorized", "Sign in required");
  }
  let since = new Date();
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval>;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`event: ready\ndata: {}\n\n`));
      timer = setInterval(async () => {
        try {
          const rows = await db
            .select()
            .from(schema.notifications)
            .where(and(eq(schema.notifications.businessId, businessId), gt(schema.notifications.createdAt, since)))
            .orderBy(schema.notifications.createdAt);
          for (const n of rows) {
            controller.enqueue(encoder.encode(`event: notification\ndata: ${JSON.stringify(n)}\n\n`));
            since = n.createdAt;
          }
          if (!rows.length) controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          clearInterval(timer);
          controller.close();
        }
      }, 2500);
    },
    cancel() {
      clearInterval(timer);
    },
  });
  req.signal.addEventListener("abort", () => clearInterval(timer));
  return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive" } });
}
