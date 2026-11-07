import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eraseCustomerAction, saveCustomerNotes } from "@/actions/workspace";
import { ConfirmSubmit, SubmitButton } from "@/components/client";
import { Avatar, Badge, BOOKING_LABEL, BOOKING_TONE, Card, CardHeader, ChannelIcon, LinkButton, PageHeader, Textarea } from "@/components/ui";
import { db, schema } from "@/db";
import { can } from "@/lib/rbac";
import { listBookings } from "@/lib/queries";
import { currentTenant } from "@/lib/tenant";
import { formatDateTime, formatMoney } from "@/lib/time";

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await currentTenant();
  const [c] = await db.select().from(schema.customers).where(and(eq(schema.customers.id, id), eq(schema.customers.businessId, t.business.id)));
  if (!c) notFound();
  const [bookings, memories, convs] = await Promise.all([
    listBookings(t.business.id, { customerId: id }),
    db.select().from(schema.customerMemories).where(and(eq(schema.customerMemories.businessId, t.business.id), eq(schema.customerMemories.customerId, id))),
    db.select().from(schema.conversations).where(and(eq(schema.conversations.businessId, t.business.id), eq(schema.conversations.customerId, id))),
  ]);
  const tz = t.business.timezone;
  const manage = can(t.role, "customers.manage");
  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-3"><Avatar name={c.name} size={40} />{c.name}</span>}
        description={[c.phone, c.email].filter(Boolean).join(" · ") || "No contact details"}
        actions={manage && <LinkButton href={`/api/v1/customers/${c.id}/export`} variant="secondary" icon="download">Export data</LinkButton>}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title={`Bookings (${bookings.length})`} />
          <ul className="divide-y divide-border">
            {bookings.slice().reverse().map((b) => (
              <li key={b.id} className="flex items-center gap-3 px-5 py-3 text-[14px]">
                <div className="flex-1">
                  <div className="font-medium">{b.service.name} <span className="font-normal text-muted">with {b.staff.name}</span></div>
                  <div className="text-[13px] text-muted">{formatDateTime(b.startsAt, tz)} · {formatMoney(b.priceCents, t.business.currency)} · via {b.source}</div>
                </div>
                <Badge tone={BOOKING_TONE[b.status]}>{BOOKING_LABEL[b.status]}</Badge>
              </li>
            ))}
          </ul>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="What your agent remembers" description="Facts learned in conversations" />
            <ul className="space-y-1.5 p-5 text-[14px]">
              {memories.length ? memories.map((m) => <li key={m.id}>✦ {m.fact}</li>) : <li className="text-muted">Nothing yet.</li>}
            </ul>
          </Card>
          <Card>
            <CardHeader title="Conversations" />
            <ul className="p-3">
              {convs.length ? convs.map((cv) => (
                <li key={cv.id}><Link href={`/app/inbox/${cv.id}`} className="flex items-center gap-2 rounded-lg px-2 py-2 text-[14px] hover:bg-subtle"><ChannelIcon channel={cv.channel} /> {cv.channel} · {cv.status}</Link></li>
              )) : <li className="px-2 py-2 text-[14px] text-muted">None</li>}
            </ul>
          </Card>
          {manage && (
            <Card>
              <CardHeader title="Private notes" />
              <form action={saveCustomerNotes} className="space-y-3 p-5">
                <input type="hidden" name="id" value={c.id} />
                <Textarea name="notes" defaultValue={c.notes} rows={4} placeholder="Visible to your team only, not to the agent." />
                <SubmitButton size="sm" variant="secondary">Save notes</SubmitButton>
              </form>
            </Card>
          )}
          {manage && (
            <Card className="border-bad/20 p-5">
              <div className="font-medium">Erase personal data</div>
              <p className="mt-1 text-[13px] text-muted">GDPR right to erasure: removes name, contact details, conversations and agent memory. Booking records are kept anonymised for your accounts.</p>
              <form action={eraseCustomerAction} className="mt-3">
                <input type="hidden" name="id" value={c.id} />
                <ConfirmSubmit message="Permanently erase this customer's personal data? This cannot be undone." icon="trash">Erase customer</ConfirmSubmit>
              </form>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
