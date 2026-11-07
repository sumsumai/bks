import Link from "next/link";
import { and, desc, eq, like, type SQL } from "drizzle-orm";
import { Table, Td, fmtDate } from "@/components/admin/table";
import { Badge, Card, Empty, Input, PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { requirePlatform } from "@/lib/auth";

export const metadata = { title: "Audit log" };

export default async function AdminAudit({ searchParams }: { searchParams: Promise<{ business?: string; action?: string }> }) {
  await requirePlatform("audit.view");
  const { business = "", action = "" } = await searchParams;
  const where: SQL[] = [];
  if (business) where.push(eq(schema.auditLog.businessId, business));
  if (action) where.push(like(schema.auditLog.action, `${action.replace(/[%_]/g, "")}%`));
  const rows = await db
    .select({ entry: schema.auditLog, businessName: schema.businesses.name })
    .from(schema.auditLog)
    .leftJoin(schema.businesses, eq(schema.businesses.id, schema.auditLog.businessId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(schema.auditLog.createdAt))
    .limit(200);
  return (
    <>
      <PageHeader eyebrow="Platform" title="Audit log" description="Latest 200 entries. Every agent action, owner change and admin action is recorded." />
      <form className="mb-4 flex flex-wrap gap-2">
        <Input name="business" defaultValue={business} placeholder="Business id (biz_…)" className="max-w-xs" />
        <Input name="action" defaultValue={action} placeholder="Action prefix (e.g. admin., booking.)" className="max-w-xs" />
        <button className="h-10 rounded-[10px] border border-border bg-surface px-4 text-[14px] hover:bg-subtle">Filter</button>
        {(business || action) && <Link href="/admin/audit" className="inline-flex h-10 items-center px-2 text-[14px] text-muted hover:text-fg">Clear</Link>}
      </form>
      <Card>
        <Table head={["When", "Business", "Actor", "Action", "Target", "Data"]} empty={!rows.length && <Empty icon="shield" title="No entries" />}>
          {rows.map(({ entry: a, businessName }) => (
            <tr key={a.id} className="align-top hover:bg-subtle/50">
              <Td className="whitespace-nowrap text-muted">{fmtDate(a.createdAt)}</Td>
              <Td>{a.businessId ? <Link href={`/admin/audit?business=${a.businessId}`} className="hover:underline">{businessName ?? a.businessId}</Link> : <span className="text-faint">platform</span>}</Td>
              <Td><Badge tone={a.actorType === "agent" ? "ai" : "neutral"}>{a.actorType}</Badge>{a.actorId && <div className="mt-0.5 font-mono text-[11px] text-faint">{a.actorId.slice(0, 16)}</div>}</Td>
              <Td mono>{a.action}</Td>
              <Td mono>{a.target ?? "—"}</Td>
              <Td className="max-w-72"><code className="line-clamp-2 break-all font-mono text-[11px] text-muted">{a.data ? JSON.stringify(a.data) : ""}</code></Td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
