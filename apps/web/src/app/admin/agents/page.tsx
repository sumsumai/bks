import Link from "next/link";
import { sql } from "drizzle-orm";
import { Table, Td, fmtDate } from "@/components/admin/table";
import { Badge, Card, PageHeader } from "@/components/ui";
import { db } from "@/db";
import { requirePlatform } from "@/lib/auth";

export const metadata = { title: "Agents" };

type Row = {
  id: string; name: string; status: string; model: string; runtime_ref: string; provisioned_at: string | null;
  business_id: string; business_name: string; pending: number; turns_30d: number; avg_latency: number | null;
  last_error: string | null; last_error_at: string | null;
};

export default async function AdminAgents() {
  await requirePlatform("businesses.view");
  const rows = (
    await db.execute(sql`
      select a.id, a.name, a.status, a.model, a.runtime_ref, a.provisioned_at, b.id as business_id, b.name as business_name,
        (select count(*)::int from agent_actions x where x.agent_id = a.id and x.status = 'pending_approval') as pending,
        (select count(*)::int from usage_events u where u.business_id = a.business_id and u.kind = 'agent_turn' and u.created_at >= now() - interval '30 days') as turns_30d,
        (select avg(latency_ms) from usage_events u where u.business_id = a.business_id and u.kind = 'agent_turn' and u.created_at >= now() - interval '30 days') as avg_latency,
        (select l.data->>'message' from audit_log l where l.business_id = a.business_id and l.action = 'agent.error' order by l.created_at desc limit 1) as last_error,
        (select max(l.created_at) from audit_log l where l.business_id = a.business_id and l.action = 'agent.error') as last_error_at
      from agents a join businesses b on b.id = a.business_id
      order by b.name`)
  ).rows as Row[];
  return (
    <>
      <PageHeader eyebrow="Platform" title="NanoClaw agents" description="One isolated agent per business. Runtime ids are opaque namespace references." />
      <Card>
        <Table head={["Business", "Agent", "Status", "Model", "Runtime", "Turns 30d", "Pending", "Last error"]}>
          {rows.map((a) => (
            <tr key={a.id} className="hover:bg-subtle/50">
              <Td><Link href={`/admin/businesses/${a.business_id}`} className="font-medium hover:underline">{a.business_name}</Link></Td>
              <Td>{a.name}<div className="text-[12px] text-faint">since {fmtDate(a.provisioned_at)}</div></Td>
              <Td><Badge tone={a.status === "active" ? "ok" : a.status === "error" ? "bad" : "warn"}>{a.status}</Badge></Td>
              <Td mono>{a.model}</Td>
              <Td mono>{a.runtime_ref.slice(0, 12)}…</Td>
              <Td className="tabular-nums">{Number(a.turns_30d)}{a.avg_latency ? <div className="text-[12px] text-faint">avg {(Number(a.avg_latency) / 1000).toFixed(1)}s</div> : null}</Td>
              <Td className="tabular-nums">{Number(a.pending) ? <Badge tone="warn">{Number(a.pending)}</Badge> : "0"}</Td>
              <Td className="max-w-56">{a.last_error ? <><div className="truncate text-[13px] text-bad" title={a.last_error}>{a.last_error}</div><div className="text-[12px] text-faint">{fmtDate(a.last_error_at)}</div></> : <span className="text-faint">—</span>}</Td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
