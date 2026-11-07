import { count } from "drizzle-orm";
import { deletePlan, savePlan } from "@/actions/admin-platform";
import { ConfirmSubmit, SubmitButton, Toggle } from "@/components/client";
import { Badge, Card, CardHeader, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { ActionForm } from "@/components/workspace/action-form";
import { db, schema } from "@/db";
import { requirePlatform } from "@/lib/auth";
import { stripeEnabled } from "@/lib/billing";
import { formatPlanPrice, listPlans } from "@/lib/plans";

export const metadata = { title: "Plans & pricing" };

type Plan = schema.Plan;

function PlanFields({ p }: { p?: Plan }) {
  const e = p?.entitlements;
  return (
    <div className="space-y-4">
      {p && <input type="hidden" name="existingId" value={p.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name"><Input name="name" defaultValue={p?.name} required /></Field>
        {p ? (
          <Field label="Plan id" hint="fixed"><Input value={p.id} disabled /></Field>
        ) : (
          <Field label="Plan id" hint="e.g. pro"><Input name="id" placeholder="from the name" /></Field>
        )}
      </div>
      <Field label="Short description"><Input name="description" defaultValue={p?.description} /></Field>
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Price"><Input name="price" type="number" min={0} step="0.01" defaultValue={p ? p.priceCents / 100 : ""} required /></Field>
        <Field label="Currency"><Input name="currency" defaultValue={p?.currency ?? "EUR"} maxLength={3} /></Field>
        <Field label="Per">
          <Select name="interval" defaultValue={p?.interval ?? "month"}><option value="month">month</option><option value="year">year</option></Select>
        </Field>
        <Field label="Trial days"><Input name="trialDays" type="number" min={0} defaultValue={p?.trialDays ?? 14} /></Field>
      </div>
      <Field label="Features" hint="one per line, shown on pricing"><Textarea name="features" rows={5} defaultValue={p?.features.join("\n")} /></Field>

      <div className="rounded-lg border border-border p-4">
        <div className="mb-3 text-[13px] font-semibold">What the plan includes</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="AI conversations / month" hint="blank = unlimited"><Input name="ent.maxConversationsPerMonth" type="number" min={0} defaultValue={e?.maxConversationsPerMonth ?? ""} /></Field>
          <Field label="Team members" hint="blank = unlimited"><Input name="ent.maxStaff" type="number" min={1} defaultValue={e?.maxStaff ?? ""} /></Field>
        </div>
        <div className="mt-4 grid gap-x-12 gap-y-3 sm:grid-cols-2">
          <Toggle name="ent.whatsapp" defaultChecked={e?.whatsapp ?? true} label="WhatsApp" />
          <Toggle name="ent.telegram" defaultChecked={e?.telegram ?? true} label="Telegram" />
          <Toggle name="ent.community" defaultChecked={e?.community ?? false} label="VIP community" />
          <Toggle name="ent.featured" defaultChecked={e?.featured ?? false} label="Featured in marketplace" />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Stripe price id" hint="price_…"><Input name="stripePriceId" defaultValue={p?.stripePriceId ?? ""} /></Field>
        <Field label="Display order"><Input name="sortOrder" type="number" min={0} defaultValue={p?.sortOrder ?? 0} /></Field>
      </div>
      <div className="grid gap-x-12 gap-y-3 sm:grid-cols-3">
        <Toggle name="active" defaultChecked={p?.active ?? true} label="Available" description="Can be chosen" />
        <Toggle name="public" defaultChecked={p?.public ?? true} label="Public" description="On pricing pages" />
        <Toggle name="highlighted" defaultChecked={p?.highlighted ?? false} label="Highlighted" description="“Most popular”" />
      </div>
    </div>
  );
}

export default async function AdminPlans() {
  await requirePlatform("plans.manage");
  const [plans, usage, stripe] = await Promise.all([
    listPlans(),
    db.select({ tier: schema.businesses.tier, n: count() }).from(schema.businesses).groupBy(schema.businesses.tier),
    stripeEnabled(),
  ]);
  const users = new Map(usage.map((u) => [u.tier, Number(u.n)]));
  return (
    <>
      <PageHeader eyebrow="Revenue" title="Plans & pricing" description="Prices, features and limits for every plan. Limits apply to subscribers immediately; the pricing page and billing page update automatically." />
      {!stripe && <p className="mb-6 rounded-card bg-warn/10 px-4 py-3 text-[14px] text-warn">Stripe isn&apos;t connected: plan changes apply immediately without payment. Add the Stripe key in Settings and a Stripe price id on each paid plan.</p>}
      <div className="space-y-4">
        {plans.map((p) => {
          const price = formatPlanPrice(p);
          return (
            <Card key={p.id}>
              <details>
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 font-semibold">
                      {p.name} <code className="text-[12px] font-normal text-faint">{p.id}</code>
                      {p.highlighted && <Badge tone="ai">Highlighted</Badge>}
                      {!p.active && <Badge tone="warn">Unavailable</Badge>}
                      {!p.public && <Badge>Hidden</Badge>}
                    </div>
                    <div className="mt-0.5 text-[13px] text-muted">
                      {p.entitlements.maxConversationsPerMonth ?? "Unlimited"} AI conversations · {p.entitlements.maxStaff ?? "Unlimited"} staff
                      {p.entitlements.community ? " · community" : ""}
                      {p.entitlements.featured ? " · featured" : ""}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[20px] font-semibold tabular-nums">{price.amount}<span className="text-[13px] font-normal text-muted">/{price.per}</span></div>
                    <div className="text-[12px] text-muted">{users.get(p.id) ?? 0} businesses</div>
                  </div>
                </summary>
                <div className="border-t border-border p-5">
                  <ActionForm action={savePlan}>
                    <PlanFields p={p} />
                    <SubmitButton className="mt-5">Save {p.name}</SubmitButton>
                  </ActionForm>
                  <form action={deletePlan} className="mt-3">
                    <input type="hidden" name="id" value={p.id} />
                    <ConfirmSubmit variant="ghost" icon="trash" message={users.get(p.id) ? `${users.get(p.id)} businesses use ${p.name}. It will be archived (hidden and unavailable), not deleted.` : `Delete ${p.name}?`}>
                      {users.get(p.id) ? "Archive plan" : "Delete plan"}
                    </ConfirmSubmit>
                  </form>
                </div>
              </details>
            </Card>
          );
        })}
        <Card>
          <CardHeader title="New plan" />
          <ActionForm action={savePlan} className="p-5" resetOnSuccess>
            <PlanFields />
            <SubmitButton className="mt-5">Create plan</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
