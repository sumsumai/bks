import Link from "next/link";
import { Avatar, Badge, ChannelIcon, cx, Empty } from "@/components/ui";
import { listConversations } from "@/lib/queries";
import { currentTenant } from "@/lib/tenant";
import { formatTime, zonedParts, todayIn, formatDate } from "@/lib/time";

export const metadata = { title: "Inbox" };

export default async function InboxLayout({ children }: { children: React.ReactNode }) {
  const t = await currentTenant();
  const convs = await listConversations(t.business.id, { limit: 100 });
  const tz = t.business.timezone;
  const today = todayIn(tz);
  return (
    <div className="-my-6 grid h-[calc(100dvh-3.5rem)] overflow-hidden rounded-card border border-border bg-surface shadow-card lg:-my-4 lg:h-[calc(100dvh-5rem)] lg:grid-cols-[320px_1fr]">
      <aside className="flex min-h-0 flex-col border-r border-border">
        <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
          <h1 className="text-[16px] font-semibold">Inbox</h1>
          <span className="text-[12px] text-muted">{convs.filter((c) => c.status === "escalated").length} need you</span>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {convs.length === 0 && <Empty icon="inbox" title="No conversations yet">Messages from WhatsApp, Telegram and your booking page chat appear here.</Empty>}
          {convs.map((c) => (
            <li key={c.id}>
              <Link href={`/app/inbox/${c.id}`} className={cx("flex gap-3 border-b border-border/60 px-4 py-3 hover:bg-subtle/70", c.status === "escalated" && "bg-warn/5")}>
                <Avatar name={c.customer?.name ?? (c.externalThreadId.startsWith("test:") ? "Test" : "Guest")} size={34} color={c.status === "escalated" ? "#b45309" : "#71717a"} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[14px] font-medium">{c.customer?.name ?? (c.externalThreadId.startsWith("test:") ? "Playground test" : "Web visitor")}</span>
                    <ChannelIcon channel={c.channel} size={12} />
                    <span className="ml-auto shrink-0 text-[11px] text-faint">{zonedParts(c.lastMessageAt, tz).date === today ? formatTime(c.lastMessageAt, tz) : formatDate(c.lastMessageAt, tz, "en-GB", { weekday: undefined })}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <span className="truncate text-[13px] text-muted">{c.lastRole === "agent" ? "✦ " : c.lastRole === "owner" ? "You: " : ""}{c.lastMessage}</span>
                  </div>
                  <div className="mt-1 flex gap-1">
                    {c.status === "escalated" && <Badge tone="warn">Needs you</Badge>}
                    {c.humanTakeover && c.status !== "escalated" && <Badge>Human</Badge>}
                    {c.status === "closed" && <Badge>Closed</Badge>}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </aside>
      <section className="contents lg:flex lg:min-h-0 lg:flex-col">{children}</section>
    </div>
  );
}
