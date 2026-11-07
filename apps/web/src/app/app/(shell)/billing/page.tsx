import { eq, sql } from "drizzle-orm";
import { changePlan } from "@/actions/billing";
import { SubmitButton } from "@/components/client";
import { Icon } from "@/components/icons";
import { Badge, Card, CardHeader, PageHeader, cx, type Tone } from "@/components/ui";
import { db, schema } from "@/db";
import { stripeEnabled } from "@/lib/billing";
import { activeStaffCount, conversationsThisMonth, formatPlanPrice, listPlans, planOf } from "@/lib/plans";
import { currentTenant, requirePermission } from "@/lib/tenant";
import { formatDate } from "@/lib/time";

export const metadata = { title: "Plan & billing" };

const STATUS_TONE: Record<string, Tone> = { active: "ok", trialing: "ai", past_due: "warn", canceled: "bad" };
const STATUS_LABEL: Record<string, string> = { active: "Active", trialing: "Trial", past_due: "Past due", canceled: "Canceled" };

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  const t = await currentTenant();
  requirePermission(t, "business.manage");
  const { checkout } = await searchParams;
  const b = t.business;

  const [sub] = await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.businessId, b.id));
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  const [usage] = (
    await db.execute(sql`
      select
        count(*) filter (where kind = 'agent_turn') as turns,
        count(*) filter (where kind = 'message_out') as messages_out,
        count(*) filter (where kind = 'message_in') as messages_in,
        coalesce(sum(input_tokens + output_tokens), 0) as tokens
      from usage_events where business_id = ${b.id} and created_at >= ${monthStart}`)
  ).rows as Record<string, unknown>[];
  const [{ plan: current, entitlements: ent }, plans, convs, staffCount, testMode] = await Promise.all([
    planOf(b),
    listPlans({ publicOnly: true }),
    conversationsThisMonth(b.id),
    activeStaffCount(b.id),
    stripeEnabled().then((x) => !x),
  ]);
  const quota = ent.maxConversationsPerMonth;
  const pct = quota ? Math.min(100, Math.round((convs / quota) * 100)) : 0;
  const shown = current && !plans.some((p) => p.id === current.id) ? [current, ...plans] : plans;

  return (
    <>
      <PageHeader title="Plan & billing" description="Your subscription, plan features and this month's usage." />

      {checkout === "success" && (
        <div className="mb-6 flex items-center gap-2 rounded-card border border-ok/20 bg-ok/10 px-4 py-3 text-[14px] text-ok">
          <Icon name="checkCircle" size={17} /> Payment received. Your plan will update in a few seconds.
        </div>
      )}
      {checkout === "cancel" && <div className="mb-6 rounded-card border border-border bg-subtle px-4 py-3 text-[14px] text-muted">Checkout was cancelled. Nothing has changed.</div>}
      {testMode && (
        <div className="mb-6 flex items-start gap-2 rounded-card border border-warn/20 bg-warn/10 px-4 py-3 text-[14px] text-warn">
          <Icon name="bolt" size={17} className="mt-0.5 shrink-0" />
          <span>Billing is in test mode: plan changes apply immediately and nothing is charged. The platform team can connect Stripe to take real payments.</span>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-1">
          <div className="text-[13px] text-muted">Current plan</div>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-[24px] font-semibold tracking-tight">{current?.name ?? b.tier}</span>
            {ent.community && <Badge tone="ai" icon="crown">VIP</Badge>}
          </div>
          <div className="mt-3 space-y-1.5 text-[14px]">
            <div className="flex justify-between"><span className="text-muted">Status</span>{sub ? <Badge tone={STATUS_TONE[sub.status]}>{STATUS_LABEL[sub.status]}</Badge> : <span>—</span>}</div>
            <div className="flex justify-between"><span className="text-muted">{sub?.status === "trialing" ? "Trial ends" : "Renews"}</span><span>{sub?.currentPeriodEnd ? formatDate(sub.currentPeriodEnd, b.timezone, "en-GB", { year: "numeric" }) : "—"}</span></div>
            <div className="flex justify-between"><span className="text-muted">Billing</span><span className="capitalize">{sub?.provider === "stripe" ? "Card (Stripe)" : "Test mode"}</span></div>
            <div className="flex justify-between"><span className="text-muted">Price</span><span>{current ? `${formatPlanPrice(current).amount}/${formatPlanPrice(current).per}` : "—"}</span></div>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Usage this month" description={`Since ${formatDate(monthStart, b.timezone, "en-GB", { weekday: undefined })}`} />
          <div className="p-5">
            <div className="flex items-baseline justify-between text-[14px]">
              <span className="font-medium">Assistant conversations</span>
              <span className="tabular-nums text-muted">{convs.toLocaleString("en-GB")} / {quota === null ? "unlimited" : quota.toLocaleString("en-GB")}</span>
            </div>
            {quota !== null && (
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-subtle">
                <div className={cx("h-full rounded-full", pct >= 100 ? "bg-bad" : pct > 90 ? "bg-warn" : "bg-ai")} style={{ width: `${pct}%` }} />
              </div>
            )}
            {quota !== null && convs >= quota && <p className="mt-2 text-[13px] text-bad">Limit reached: new conversations wait for you in the inbox until next month or an upgrade.</p>}
            <div className="mt-3 text-[13px] text-muted">Team members: {staffCount}{ent.maxStaff !== null ? ` / ${ent.maxStaff}` : ""} · {Number(usage.turns ?? 0).toLocaleString("en-GB")} assistant replies</div>
            <div className="mt-5 grid grid-cols-3 gap-4 text-[14px]">
              <div><div className="text-muted">Messages received</div><div className="mt-0.5 text-[20px] font-semibold tabular-nums">{Number(usage.messages_in ?? 0).toLocaleString("en-GB")}</div></div>
              <div><div className="text-muted">Messages sent</div><div className="mt-0.5 text-[20px] font-semibold tabular-nums">{Number(usage.messages_out ?? 0).toLocaleString("en-GB")}</div></div>
              <div><div className="text-muted">Model tokens</div><div className="mt-0.5 text-[20px] font-semibold tabular-nums">{Number(usage.tokens ?? 0).toLocaleString("en-GB")}</div></div>
            </div>
          </div>
        </Card>
      </div>

      <h2 className="mt-10 mb-4 text-[17px] font-semibold tracking-tight">Plans</h2>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {shown.map((plan) => {
          const isCurrent = b.tier === plan.id;
          const price = formatPlanPrice(plan);
          const upgrade = current ? plan.priceCents > current.priceCents : true;
          return (
            <Card key={plan.id} className={cx("relative flex flex-col p-6", plan.highlighted && "ring-1 ring-ai/40")}>
              {plan.highlighted && <div className="absolute -top-2.5 right-5"><Badge tone="solid" icon="crown">Most popular</Badge></div>}
              <div className="flex items-center gap-2 text-[15px] font-semibold">{plan.name}{isCurrent && <Badge tone="ok">Current</Badge>}</div>
              {plan.description && <p className="mt-1 text-[13px] text-muted">{plan.description}</p>}
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-[36px] font-semibold tracking-tight">{price.amount}</span>
                <span className="text-muted">/{price.per}</span>
              </div>
              <ul className="mt-5 flex-1 space-y-2 text-[14px]">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2"><Icon name="check" size={16} className={cx("mt-0.5 shrink-0", plan.highlighted ? "text-ai" : "text-ok")} />{f}</li>
                ))}
              </ul>
              <form action={changePlan} className="mt-6">
                <input type="hidden" name="tier" value={plan.id} />
                {isCurrent ? (
                  <div className="flex h-10 items-center justify-center rounded-[10px] bg-subtle text-[14px] text-muted">Your current plan</div>
                ) : !plan.active || !plan.public ? null : (
                  <SubmitButton className="w-full" variant={plan.highlighted ? "ai" : "secondary"} pendingText="Working…">
                    {upgrade ? `Upgrade to ${plan.name}` : `Switch to ${plan.name}`}
                  </SubmitButton>
                )}
              </form>
            </Card>
          );
        })}
      </div>
    </>
  );
}
