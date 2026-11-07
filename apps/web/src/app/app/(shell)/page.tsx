import Link from "next/link";
import { decideAction_ } from "@/actions/workspace";
import { Icon } from "@/components/icons";
import { Avatar, Badge, BOOKING_LABEL, BOOKING_TONE, Button, Card, CardHeader, ChannelIcon, Empty, LinkButton, PageHeader, Stat } from "@/components/ui";
import { RevenueChart } from "@/components/workspace/revenue-chart";
import { getAgent } from "@/lib/agent/runtime";
import { businessMetrics } from "@/lib/metrics";
import { listActions, listBookings, listConversations } from "@/lib/queries";
import { currentTenant } from "@/lib/tenant";
import { addDays, formatMoney, formatTime, todayIn, zonedToUtc } from "@/lib/time";

export const metadata = { title: "Overview" };

export default async function Overview({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const t = await currentTenant();
  const { welcome } = await searchParams;
  const tz = t.business.timezone;
  const today = todayIn(tz);
  const [m, todays, approvals, convs, agent] = await Promise.all([
    businessMetrics(t.business.id, 30),
    listBookings(t.business.id, { from: zonedToUtc(today, 0, tz), to: zonedToUtc(addDays(today, 1), 0, tz), status: ["pending", "confirmed", "completed", "no_show"] }),
    listActions(t.business.id, { status: "pending_approval", limit: 5 }),
    listConversations(t.business.id, { limit: 5 }),
    getAgent(t.business.id),
  ]);
  const money = (c: number) => formatMoney(c, t.business.currency);

  // Fill gaps so the chart has one bar per day (30 back, 14 ahead).
  const byDay = new Map(m.daily.map((d) => [d.day, d]));
  const days = Array.from({ length: 44 }, (_, i) => addDays(today, i - 29)).map((day) => byDay.get(day) ?? { day, bookings: 0, revenueCents: 0 });
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(new Date()));
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <>
      {welcome && (
        <Card className="animate-fade-up mb-6 overflow-hidden border-ai/30">
          <div className="flex flex-col gap-4 bg-ai/5 p-5 sm:flex-row sm:items-center">
            <div className="grid size-10 place-items-center rounded-full bg-ai text-white"><Icon name="sparkles" /></div>
            <div className="flex-1">
              <div className="font-semibold">{agent?.name ?? "Your assistant"} is live</div>
              <p className="text-[14px] text-muted">Your booking page is ready. Next: add services and FAQs, connect WhatsApp or Telegram, then publish.</p>
            </div>
            <div className="flex gap-2">
              <LinkButton href="/app/agent" variant="ai" size="sm" icon="sparkles">Try your agent</LinkButton>
              <LinkButton href="/app/settings" variant="secondary" size="sm">Publish page</LinkButton>
            </div>
          </div>
        </Card>
      )}

      <PageHeader
        eyebrow={new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "long", day: "numeric", month: "long" }).format(new Date())}
        title={`${greeting}, ${t.user.name.split(" ")[0]}`}
        description={todays.length ? `You have ${todays.filter((b) => b.status !== "cancelled").length} appointments today.` : "No appointments today."}
        actions={
          <>
            {!t.business.published && <Badge tone="warn" icon="eyeOff">Booking page unpublished</Badge>}
            <LinkButton href="/app/bookings?new=1" icon="plus">New booking</LinkButton>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Revenue · 30 days" value={money(m.revenueCents)} sub={`${money(m.upcomingRevenueCents)} booked ahead`} icon="chart" />
        <Stat label="Bookings · 30 days" value={m.bookings} sub={`${m.upcoming} upcoming · ${m.cancellations} cancelled`} icon="calendar" />
        <Stat label="Booked by your agent" value={m.agentBookings} sub={m.bookings ? `${Math.round((m.agentBookings / m.bookings) * 100)}% of all bookings` : "—"} icon="sparkles" tone="ai" />
        <Stat
          label="Agent resolution"
          value={m.resolutionRate === null ? "—" : `${Math.round(m.resolutionRate * 100)}%`}
          sub={`${m.conversations} conversations · ${m.escalated} escalated`}
          icon="checkCircle"
          tone="ai"
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Revenue" description="Last 30 days and the next two weeks already booked" />
          <div className="px-5 pt-8 pb-4"><RevenueChart days={days} currency={t.business.currency} today={today} /></div>
        </Card>

        <Card>
          <CardHeader title="Needs your approval" description="Sensitive actions your agent queued" action={<Link href="/app/approvals" className="text-[13px] text-muted hover:text-fg">All</Link>} />
          {approvals.length ? (
            <ul className="divide-y divide-border">
              {approvals.map((a) => (
                <li key={a.id} className="px-5 py-3.5">
                  <div className="text-[14px] font-medium">{a.summary}</div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted">
                    {a.channel && <ChannelIcon channel={a.channel} size={12} />} {a.customerName ?? "Unknown customer"}
                  </div>
                  <form action={decideAction_} className="mt-2.5 flex gap-2">
                    <input type="hidden" name="actionId" value={a.id} />
                    <Button name="decision" value="approve" size="sm" icon="check">Approve</Button>
                    <Button name="decision" value="reject" size="sm" variant="secondary">Reject</Button>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <Empty icon="checkCircle" title="All clear">Nothing waiting for you.</Empty>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Today" action={<Link href="/app/bookings" className="text-[13px] text-muted hover:text-fg">Calendar</Link>} />
          {todays.length ? (
            <ul className="divide-y divide-border">
              {todays.map((b) => (
                <li key={b.id} className="flex items-center gap-4 px-5 py-3">
                  <div className="w-14 text-[14px] font-semibold tabular-nums">{formatTime(b.startsAt, tz)}</div>
                  <span className="h-8 w-1 rounded-full" style={{ background: b.staff.color }} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-medium">{b.customer.name}</div>
                    <div className="truncate text-[13px] text-muted">{b.service.name} · {b.staff.name}</div>
                  </div>
                  <Badge tone={BOOKING_TONE[b.status]}>{BOOKING_LABEL[b.status]}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <Empty icon="calendar" title="A quiet day">Share your booking page or let your agent fill the gaps.</Empty>
          )}
        </Card>

        <Card>
          <CardHeader title="Latest conversations" action={<Link href="/app/inbox" className="text-[13px] text-muted hover:text-fg">Inbox</Link>} />
          {convs.length ? (
            <ul className="divide-y divide-border">
              {convs.map((c) => (
                <li key={c.id}>
                  <Link href={`/app/inbox/${c.id}`} className="flex items-start gap-3 px-5 py-3 hover:bg-subtle/60">
                    <Avatar name={c.customer?.name ?? "Guest"} size={30} color="#71717a" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-[14px] font-medium">
                        <span className="truncate">{c.customer?.name ?? "Web visitor"}</span>
                        <ChannelIcon channel={c.channel} size={12} />
                        {c.status === "escalated" && <Badge tone="warn">Needs you</Badge>}
                      </div>
                      <div className="truncate text-[13px] text-muted">{c.lastMessage}</div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty icon="chat" title="No conversations yet">Connect WhatsApp or Telegram to let customers reach your agent.</Empty>
          )}
          <div className="border-t border-border px-5 py-3 text-[12px] text-muted">
            Agent: {m.agentTurns} replies · avg {(m.avgLatencyMs / 1000).toFixed(1)}s · {agent?.status === "active" ? <span className="text-ok">online</span> : <span className="text-warn">paused</span>}
          </div>
        </Card>
      </div>
    </>
  );
}
