import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { badRequest } from "./errors";
import { audit, notifyBusiness } from "./events";
import { getPlan } from "./plans";
import { getSettings } from "./settings";

// Plans and prices live in the plans table (Admin → Plans & pricing). Stripe keys in Admin → Settings.

export const stripeEnabled = async () => Boolean((await getSettings())["billing.stripeSecretKey"]);

async function stripe(path: string, params: Record<string, string>) {
  const key = (await getSettings())["billing.stripeSecretKey"];
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message ?? `Stripe ${res.status}`);
  return json;
}

/** Start a plan change. With Stripe: returns a Checkout URL. In test mode: applies immediately. */
export async function startPlanChange(business: schema.Business, planId: string, userId: string, returnUrl: string) {
  const plan = await getPlan(planId);
  if (!plan.active || !plan.public) throw badRequest("This plan isn't available");
  if (plan.priceCents > 0 && (await stripeEnabled())) {
    if (!plan.stripePriceId) throw badRequest(`The ${plan.name} plan has no Stripe price yet. Contact support.`);
    const session = await stripe("checkout/sessions", {
      mode: "subscription",
      "line_items[0][price]": plan.stripePriceId,
      "line_items[0][quantity]": "1",
      success_url: `${returnUrl}?checkout=success`,
      cancel_url: `${returnUrl}?checkout=cancel`,
      client_reference_id: business.id,
      "metadata[business_id]": business.id,
      "metadata[tier]": plan.id,
      "subscription_data[metadata][business_id]": business.id,
      "subscription_data[metadata][tier]": plan.id,
    });
    return { url: session.url as string };
  }
  await applyTier(business.id, plan.id, { status: "active", provider: "test" }, { type: "user", id: userId });
  return { url: null };
}

export async function applyTier(
  businessId: string,
  planId: string,
  sub: Partial<typeof schema.subscriptions.$inferInsert>,
  actor: { type: "user" | "system"; id?: string },
) {
  const plan = await getPlan(planId);
  await db.update(schema.businesses).set({ tier: plan.id }).where(eq(schema.businesses.id, businessId));
  await db
    .insert(schema.subscriptions)
    .values({ businessId, tier: plan.id, status: "active", provider: "test", ...sub })
    .onConflictDoUpdate({ target: schema.subscriptions.businessId, set: { tier: plan.id, ...sub, updatedAt: new Date() } });
  await audit(businessId, actor, "subscription.changed", businessId, { tier: plan.id });
  await notifyBusiness(businessId, {
    kind: "subscription.changed",
    title: `You're on ${plan.name}`,
    body: plan.entitlements.community ? "The VIP community is unlocked." : "Your plan has been updated.",
    href: plan.entitlements.community ? "/app/community" : "/app/billing",
  });
}
