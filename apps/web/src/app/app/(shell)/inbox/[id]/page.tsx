import Link from "next/link";
import { conversationAction, decideAction_, replyAction } from "@/actions/workspace";
import { SubmitButton } from "@/components/client";
import { Icon } from "@/components/icons";
import { Avatar, Badge, Button, ChannelIcon, cx, Textarea } from "@/components/ui";
import { getConversation } from "@/lib/queries";
import { currentTenant } from "@/lib/tenant";
import { formatDateTime, formatTime } from "@/lib/time";

export default async function Thread({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await currentTenant();
  const c = await getConversation(t.business.id, id);
  const tz = t.business.timezone;
  type Item = { at: Date; kind: "msg"; m: (typeof c.messages)[number] } | { at: Date; kind: "act"; a: (typeof c.actions)[number] };
  const items: Item[] = [...c.messages.map((m) => ({ at: m.createdAt, kind: "msg" as const, m })), ...c.actions.map((a) => ({ at: a.createdAt, kind: "act" as const, a }))].sort((x, y) => x.at.getTime() - y.at.getTime());
  const name = c.customer?.name ?? (c.externalThreadId.startsWith("test:") ? "Playground test" : "Web visitor");

  return (
    <div className="fixed inset-0 top-14 z-40 flex flex-col bg-surface lg:static lg:z-auto lg:min-h-0 lg:flex-1">
      <header className="flex items-center gap-3 border-b border-border px-5 py-3">
        <Link href="/app/inbox" className="lg:hidden"><Icon name="chevronLeft" /></Link>
        <Avatar name={name} size={34} color="#71717a" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 font-semibold">{name} <ChannelIcon channel={c.channel} /></div>
          <div className="truncate text-[12px] text-muted">
            {[c.customer?.phone, c.customer?.email].filter(Boolean).join(" · ") || c.channel}
            {c.customer && <> · <Link href={`/app/customers/${c.customer.id}`} className="underline-offset-2 hover:underline">profile</Link></>}
          </div>
        </div>
        <form action={conversationAction} className="flex gap-2">
          <input type="hidden" name="conversationId" value={c.id} />
          {c.humanTakeover ? (
            <Button name="action" value="release" variant="ai" size="sm" icon="sparkles">Hand back to agent</Button>
          ) : (
            <Button name="action" value="takeover" variant="secondary" size="sm" icon="hand">Take over</Button>
          )}
          {c.status !== "closed" ? <Button name="action" value="close" variant="ghost" size="sm">Close</Button> : <Button name="action" value="reopen" variant="ghost" size="sm">Reopen</Button>}
        </form>
      </header>

      {c.status === "escalated" && (
        <div className="flex items-center gap-2 border-b border-warn/20 bg-warn/10 px-5 py-2.5 text-[13px] text-warn">
          <Icon name="flag" size={15} /> Escalated: {c.escalationReason ?? "the agent asked for a human"}. The agent is silent until you hand it back.
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-subtle/40 px-5 py-6">
        {items.map((it) =>
          it.kind === "msg" ? (
            it.m.role === "system" ? (
              <div key={it.m.id} className="text-center text-[12px] text-faint">{it.m.content} · {formatTime(it.m.createdAt, tz)}</div>
            ) : (
              <div key={it.m.id} className={cx("flex", it.m.role === "customer" ? "justify-start" : "justify-end")}>
                <div className={cx("max-w-[75%] rounded-2xl px-3.5 py-2 text-[14px] shadow-card", it.m.role === "customer" ? "rounded-bl-md bg-surface" : it.m.role === "agent" ? "rounded-br-md bg-ai/10 ring-1 ring-ai/20" : "rounded-br-md bg-accent text-accent-fg")}>
                  <div className="whitespace-pre-wrap">{it.m.content}</div>
                  <div className={cx("mt-1 text-[11px]", it.m.role === "owner" ? "opacity-60" : "text-faint")}>
                    {it.m.role === "agent" ? "✦ Agent · " : it.m.role === "owner" ? "You · " : ""}{formatTime(it.m.createdAt, tz)}
                  </div>
                </div>
              </div>
            )
          ) : (
            <div key={it.a.id} className="flex justify-end">
              <div className="flex max-w-[75%] items-center gap-2 rounded-lg border border-dashed border-border bg-surface px-3 py-1.5 text-[12px] text-muted">
                <Icon name="bolt" size={13} className="text-ai" />
                <span>{it.a.summary || it.a.tool}</span>
                <Badge tone={it.a.status === "executed" || it.a.status === "approved" ? "ok" : it.a.status === "pending_approval" ? "warn" : it.a.status === "failed" || it.a.status === "rejected" ? "bad" : "neutral"}>{it.a.status.replace("_", " ")}</Badge>
                {it.a.status === "pending_approval" && (
                  <form action={decideAction_} className="flex gap-1">
                    <input type="hidden" name="actionId" value={it.a.id} />
                    <button name="decision" value="approve" className="rounded bg-accent px-2 py-0.5 text-accent-fg">Approve</button>
                    <button name="decision" value="reject" className="rounded border border-border px-2 py-0.5">Reject</button>
                  </form>
                )}
              </div>
            </div>
          ),
        )}
      </div>

      {c.channel === "web" && c.externalThreadId.startsWith("test:") ? (
        <div className="border-t border-border px-5 py-3 text-[13px] text-muted">Playground conversation. Continue it from the Agent page.</div>
      ) : (
        <form action={replyAction} className="border-t border-border p-3">
          <input type="hidden" name="conversationId" value={c.id} />
          <div className="flex items-end gap-2">
            <Textarea name="text" rows={2} placeholder={c.humanTakeover ? "Reply to the customer…" : "Replying takes over the conversation from the agent…"} className="min-h-12 flex-1 resize-none" required />
            <SubmitButton icon="send">Send</SubmitButton>
          </div>
          <div className="mt-1.5 text-[11px] text-faint">Sent via {c.channel}. Last activity {formatDateTime(c.lastMessageAt, tz)}.</div>
        </form>
      )}
    </div>
  );
}
