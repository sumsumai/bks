import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";

const n = (v: unknown) => Number(v ?? 0);

/** Owner dashboard numbers for one business. All queries are filtered by business id. */
export async function businessMetrics(businessId: string, days = 30) {
  const since = new Date(Date.now() - days * 86400_000);
  const [bk] = (
    await db.execute(sql`
      select
        count(*) filter (where status in ('confirmed','completed','pending') and created_at >= ${since}) as bookings,
        coalesce(sum(price_cents) filter (where status in ('confirmed','completed') and starts_at >= ${since} and starts_at <= now()), 0) as revenue,
        coalesce(sum(price_cents) filter (where status in ('confirmed','pending') and starts_at > now()), 0) as upcoming_revenue,
        count(*) filter (where status in ('confirmed','pending') and starts_at > now()) as upcoming,
        count(*) filter (where source in ('agent','whatsapp','telegram') and created_at >= ${since}) as agent_bookings,
        count(*) filter (where status = 'cancelled' and updated_at >= ${since}) as cancellations,
        count(*) filter (where status = 'no_show' and starts_at >= ${since}) as no_shows
      from bookings where business_id = ${businessId}`)
  ).rows as Record<string, unknown>[];
  const [cv] = (
    await db.execute(sql`
      select
        count(*) filter (where created_at >= ${since}) as conversations,
        count(*) filter (where created_at >= ${since} and escalation_reason is not null) as escalated,
        count(*) filter (where status = 'escalated') as open_escalations
      from conversations where business_id = ${businessId}`)
  ).rows as Record<string, unknown>[];
  const [ag] = (
    await db.execute(sql`
      select
        count(*) filter (where kind = 'agent_turn') as turns,
        coalesce(avg(latency_ms) filter (where kind = 'agent_turn'), 0) as avg_latency,
        coalesce(sum(input_tokens + output_tokens), 0) as tokens
      from usage_events where business_id = ${businessId} and created_at >= ${since}`)
  ).rows as Record<string, unknown>[];
  const [ac] = (
    await db.execute(sql`
      select
        count(*) filter (where status = 'pending_approval') as pending,
        count(*) filter (where status = 'executed' and created_at >= ${since}) as executed,
        count(*) filter (where status = 'failed' and created_at >= ${since}) as failed
      from agent_actions where business_id = ${businessId}`)
  ).rows as Record<string, unknown>[];
  const [cu] = (
    await db.execute(sql`select count(*) filter (where created_at >= ${since}) as new_customers, count(*) as customers from customers where business_id = ${businessId} and erased_at is null`)
  ).rows as Record<string, unknown>[];
  const daily = (
    await db.execute(sql`
      select to_char(date_trunc('day', starts_at), 'YYYY-MM-DD') as day, count(*) as bookings, coalesce(sum(price_cents),0) as revenue
      from bookings where business_id = ${businessId} and status in ('confirmed','completed') and starts_at >= ${since} and starts_at < now() + interval '14 days'
      group by 1 order by 1`)
  ).rows as Record<string, unknown>[];

  const conversations = n(cv.conversations);
  return {
    days,
    bookings: n(bk.bookings),
    revenueCents: n(bk.revenue),
    upcoming: n(bk.upcoming),
    upcomingRevenueCents: n(bk.upcoming_revenue),
    agentBookings: n(bk.agent_bookings),
    cancellations: n(bk.cancellations),
    noShows: n(bk.no_shows),
    conversations,
    escalated: n(cv.escalated),
    openEscalations: n(cv.open_escalations),
    resolutionRate: conversations ? 1 - n(cv.escalated) / conversations : null,
    agentTurns: n(ag.turns),
    avgLatencyMs: Math.round(n(ag.avg_latency)),
    tokens: n(ag.tokens),
    pendingApprovals: n(ac.pending),
    actionsExecuted: n(ac.executed),
    actionsFailed: n(ac.failed),
    customers: n(cu.customers),
    newCustomers: n(cu.new_customers),
    daily: daily.map((d) => ({ day: String(d.day), bookings: n(d.bookings), revenueCents: n(d.revenue) })),
  };
}

export async function platformMetrics(days = 30): Promise<Record<string, number> & { mrr: number }> {
  const since = new Date(Date.now() - days * 86400_000);
  const [row] = (
    await db.execute(sql`
      select
        (select count(*) from businesses) as businesses,
        (select count(*) from businesses b join plans p on p.id = b.tier where (p.entitlements->>'community')::boolean) as vip,
        (select count(*) from businesses where published) as published,
        (select count(*) from businesses where suspended) as suspended,
        (select count(*) from users) as users,
        (select count(*) from agents where status = 'active') as active_agents,
        (select count(*) from agents where status = 'error') as error_agents,
        (select count(*) from bookings where created_at >= ${since}) as bookings,
        (select coalesce(sum(price_cents),0) from bookings where status in ('confirmed','completed') and created_at >= ${since}) as gmv,
        (select count(*) from usage_events where kind = 'agent_turn' and created_at >= ${since}) as agent_turns,
        (select coalesce(sum(input_tokens + output_tokens),0) from usage_events where created_at >= ${since}) as tokens,
        (select count(*) from usage_events where kind = 'message_out' and created_at >= ${since}) as messages_out,
        (select count(*) from channels where status = 'connected' and kind = 'whatsapp') as whatsapp,
        (select count(*) from channels where status = 'connected' and kind = 'telegram') as telegram,
        (select count(*) from subscriptions s join plans p on p.id = s.tier where s.status = 'active' and p.price_cents > 0) as paying,
        (select coalesce(sum(case when p.interval = 'year' then p.price_cents / 12.0 else p.price_cents end), 0)
           from subscriptions s join plans p on p.id = s.tier where s.status = 'active') as mrr_cents`)
  ).rows as Record<string, unknown>[];
  const out = Object.fromEntries(Object.entries(row).map(([k, v]) => [k, n(v)])) as Record<string, number>;
  return { ...out, mrr: Math.round(out.mrr_cents / 100) };
}
