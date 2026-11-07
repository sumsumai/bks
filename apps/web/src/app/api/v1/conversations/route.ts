import { query, tenantRoute } from "@/lib/api";
import { listConversations } from "@/lib/queries";

export const GET = tenantRoute("inbox.reply", async (req, t) => ({
  conversations: await listConversations(t.business.id, { status: (query(req).get("status") as any) || undefined }),
}));
