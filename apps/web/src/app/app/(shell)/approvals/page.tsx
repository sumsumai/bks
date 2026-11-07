import Link from "next/link";
import { decideAction_ } from "@/actions/workspace";
import { Badge, Button, Card, ChannelIcon, cx, Empty, Input, PageHeader } from "@/components/ui";
import { listActions } from "@/lib/queries";
import { requirePermission } from "@/lib/tenant";
import { currentTenant } from "@/lib/tenant";
import { formatDateTime } from "@/lib/time";

export const metadata = { title: "Approvals" };

const TONE = { executed: "ok", approved: "ok", pending_approval: "warn", rejected: "bad", failed: "bad", expired: "neutral" } as const;

export default async function Approvals({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const t = await currentTenant();
  requirePermission(t, "agent.approve");
  const { tab } = await searchParams;
  const history = tab === "log";
  const actions = await listActions(t.business.id, { status: history ? undefined : "pending_approval", limit: 200 });
  return (
    <>
      <PageHeader title="Approvals & activity" description="Actions your agent wants to take that need your OK, and a full audit trail of everything it did." />
      <div className="mb-4 flex gap-1 text-[14px]">
        <Link href="/app/approvals" className={cx("rounded-lg px-3 py-1.5", !history ? "bg-surface font-medium shadow-card ring-1 ring-border" : "text-muted")}>Waiting</Link>
        <Link href="/app/approvals?tab=log" className={cx("rounded-lg px-3 py-1.5", history ? "bg-surface font-medium shadow-card ring-1 ring-border" : "text-muted")}>Activity log</Link>
      </div>
      <Card>
        {actions.length === 0 ? (
          <Empty icon="checkCircle" title={history ? "No agent activity yet" : "Nothing to approve"}>{history ? "Every tool call your agent makes will be listed here." : "When your agent queues a sensitive action (like a cancellation), it lands here and on your phone."}</Empty>
        ) : (
          <ul className="divide-y divide-border">
            {actions.map((a) => (
              <li key={a.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{a.summary || a.tool}</span>
                    <Badge tone={TONE[a.status]}>{a.status.replace("_", " ")}</Badge>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[13px] text-muted">
                    {a.channel && <ChannelIcon channel={a.channel} size={12} />}
                    {a.customerName ?? "Unknown customer"} · {formatDateTime(a.createdAt, t.business.timezone)} · <code className="text-[12px]">{a.tool}</code>
                    {a.conversationId && <Link href={`/app/inbox/${a.conversationId}`} className="underline-offset-2 hover:underline">conversation</Link>}
                  </div>
                  {a.status === "failed" && a.output != null && <div className="mt-1 text-[12px] text-bad">{String((a.output as { error?: string }).error ?? "")}</div>}
                </div>
                {a.status === "pending_approval" && (
                  <form action={decideAction_} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="actionId" value={a.id} />
                    <Input name="note" placeholder="Note to customer (optional)" className="h-8 w-56 text-[13px]" />
                    <Button name="decision" value="approve" size="sm" icon="check">Approve</Button>
                    <Button name="decision" value="reject" size="sm" variant="secondary">Reject</Button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
