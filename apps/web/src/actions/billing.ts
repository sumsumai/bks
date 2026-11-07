"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { startPlanChange } from "@/lib/billing";
import { getSetting } from "@/lib/settings";
import { tenantFor } from "@/lib/tenant";

export async function changePlan(form: FormData) {
  const t = await tenantFor("business.manage");
  const tier = String(form.get("tier") ?? "");
  if (tier === t.business.tier) return;
  const h = await headers();
  const origin = (await getSetting("general.appUrl")) || `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const { url } = await startPlanChange(t.business, tier, t.user.id, `${origin.replace(/\/$/, "")}/app/billing`);
  if (url) redirect(url);
  revalidatePath("/app", "layout");
}
