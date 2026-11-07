import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { applyTier } from "@/lib/billing";
import { getSetting } from "@/lib/settings";
import { hmacSha256Hex, safeEqual } from "@/lib/crypto";

function verify(raw: string, header: string | null, secret: string | null) {
  if (!secret || !header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  if (!parts.t || !parts.v1 || Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) return false;
  return safeEqual(hmacSha256Hex(secret, `${parts.t}.${raw}`), parts.v1);
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verify(raw, req.headers.get("stripe-signature"), await getSetting("billing.stripeWebhookSecret"))) return new Response("invalid signature", { status: 400 });
  const event = JSON.parse(raw) as { type: string; data: { object: any } };
  const obj = event.data.object;
  const businessId: string | undefined = obj?.metadata?.business_id;
  if (!businessId) return Response.json({ received: true });

  switch (event.type) {
    case "checkout.session.completed":
      await applyTier(businessId, String(obj.metadata.tier ?? "standard"), { status: "active", provider: "stripe", providerCustomerId: obj.customer, providerSubscriptionId: obj.subscription }, { type: "system" });
      break;
    case "customer.subscription.updated":
      await db
        .update(schema.subscriptions)
        .set({ status: obj.status === "active" || obj.status === "trialing" ? obj.status : obj.status === "past_due" ? "past_due" : "canceled", currentPeriodEnd: obj.current_period_end ? new Date(obj.current_period_end * 1000) : null, updatedAt: new Date() })
        .where(eq(schema.subscriptions.businessId, businessId));
      break;
    case "customer.subscription.deleted":
      await applyTier(businessId, "standard", { status: "canceled", provider: "stripe" }, { type: "system" });
      break;
  }
  return Response.json({ received: true });
}
