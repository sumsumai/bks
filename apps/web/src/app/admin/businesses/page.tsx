import Link from "next/link";
import { sql } from "drizzle-orm";
import { Table, Td } from "@/components/admin/table";
import { Badge, Card, Empty, Input, PageHeader } from "@/components/ui";
import { db } from "@/db";
import { requirePlatform } from "@/lib/auth";
import { listPlans } from "@/lib/plans";

export const metadata = { title: "Businesses" };

type Row = { id: string; name: string; slug: string; tier: string; published: boolean; suspended: boolean; owner_email: string | null; bookings_30d: number; agent_status: string | null; city: string };

export default async function AdminBusinesses({ searchParams }: { searchParams: Promise<{ q?: string; tier?: string }> }) {
  await requirePlatform("businesses.view");
  const planNames = new Map((await listPlans()).map((p) => [p.id, p]));
  const { q = "", tier = "" } = await searchParams;
  const like = `%${q.toLowerCase()}%`;
  const rows = (
    await db.execute(sql`
      select b.id, b.name, b.slug, b.tier, b.published, b.suspended, b.city,
        (select u.email from memberships m join users u on u.id = m.user_id where m.business_id = b.id and m.role = 'owner' limit 1) as owner_email,
        (select count(*)::int from bookings k where k.business_id = b.id and k.created_at >= now() - interval '30 days') as bookings_30d,
        (select a.status from agents a where a.business_id = b.id) as agent_status
      from businesses b
      where (${q} = '' or lower(b.name) like ${like} or lower(b.slug) like ${like} or exists (
        select 1 from memberships m join users u on u.id = m.user_id where m.business_id = b.id and lower(u.email) like ${like}))
        and (${tier} = '' or b.tier::text = ${tier})
      order by b.created_at desc
      limit 300`)
  ).rows as Row[];

  return (
    <>
      <PageHeader eyebrow="Platform" title="Businesses" description={`${rows.length} shown`} />
      <form className="mb-4 flex flex-wrap gap-2">
        <Input name="q" defaultValue={q} placeholder="Search name, slug or owner email…" className="max-w-sm" />
        <select name="tier" defaultValue={tier} className="h-10 rounded-[10px] border border-border bg-surface px-3 text-[14px]">
          <option value="">All plans</option>
          {[...planNames.values()].map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button className="h-10 rounded-[10px] border border-border bg-surface px-4 text-[14px] hover:bg-subtle">Filter</button>
      </form>
      <Card>
        <Table head={["Business", "Owner", "Tier", "Status", "Bookings 30d", "Agent"]} empty={!rows.length && <Empty icon="building" title="No businesses match" />}>
          {rows.map((b) => (
            <tr key={b.id} className="hover:bg-subtle/50">
              <Td>
                <Link href={`/admin/businesses/${b.id}`} className="font-medium hover:underline">{b.name}</Link>
                <div className="text-[12px] text-faint">/{b.slug}{b.city ? ` · ${b.city}` : ""}</div>
              </Td>
              <Td className="text-muted">{b.owner_email ?? "—"}</Td>
              <Td><Badge tone={planNames.get(b.tier)?.entitlements.community ? "ai" : "neutral"}>{planNames.get(b.tier)?.name ?? b.tier}</Badge></Td>
              <Td>
                <div className="flex flex-wrap gap-1">
                  {b.suspended ? <Badge tone="bad">Suspended</Badge> : b.published ? <Badge tone="ok">Published</Badge> : <Badge tone="warn">Unpublished</Badge>}
                </div>
              </Td>
              <Td className="tabular-nums">{Number(b.bookings_30d)}</Td>
              <Td>{b.agent_status ? <Badge tone={b.agent_status === "active" ? "ok" : b.agent_status === "error" ? "bad" : "warn"}>{b.agent_status}</Badge> : <Badge tone="bad">missing</Badge>}</Td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
