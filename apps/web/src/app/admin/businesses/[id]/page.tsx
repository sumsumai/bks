import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { adminProvisionAgent, adminSetAgentStatus, adminSetPublished, adminSetSuspended } from "@/actions/admin";
import { addMembership, impersonate, updateBusinessAdmin, updateMembership, updateSubscriptionAdmin } from "@/actions/admin-platform";
import { ActionForm } from "@/components/workspace/action-form";
import { CATEGORIES } from "@/lib/businesses";
import { listPlans } from "@/lib/plans";
import { platformCan } from "@/lib/platform-rbac";
import { Table, Td, eur, fmtDate } from "@/components/admin/table";
import { ConfirmSubmit, SubmitButton } from "@/components/client";
import { Icon } from "@/components/icons";
import { Badge, Button, Card, CardHeader, Field, Input, PageHeader, Select, Stat } from "@/components/ui";
import { db, schema } from "@/db";
import { requirePlatform } from "@/lib/auth";
import { businessMetrics } from "@/lib/metrics";

function Hidden({ id }: { id: string }) {
  return <input type="hidden" name="businessId" value={id} />;
}

export default async function AdminBusinessDetail({ params }: { params: Promise<{ id: string }> }) {
  const me = await requirePlatform("businesses.view");
  const can = (p: Parameters<typeof platformCan>[1]) => platformCan(me.platformRole, p);
  const { id } = await params;
  const [b] = await db.select().from(schema.businesses).where(eq(schema.businesses.id, id));
  if (!b) notFound();
  const [[agent], [sub], members, channels, audit, m] = await Promise.all([
    db.select().from(schema.agents).where(eq(schema.agents.businessId, id)),
    db.select().from(schema.subscriptions).where(eq(schema.subscriptions.businessId, id)),
    db.select({ role: schema.memberships.role, user: schema.users }).from(schema.memberships).innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId)).where(eq(schema.memberships.businessId, id)),
    db.select().from(schema.channels).where(eq(schema.channels.businessId, id)),
    db.select().from(schema.auditLog).where(eq(schema.auditLog.businessId, id)).orderBy(desc(schema.auditLog.createdAt)).limit(25),
    businessMetrics(id, 30),
  ]);
  const plans = await listPlans();
  const plan = plans.find((p) => p.id === b.tier);

  return (
    <>
      <Link href="/admin/businesses" className="mb-3 inline-flex items-center gap-1 text-[13px] text-muted hover:text-fg"><Icon name="chevronLeft" size={14} /> Businesses</Link>
      <PageHeader
        title={<span className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-lg text-[15px] text-white" style={{ background: b.brandColor }}>{b.name[0]}</span>{b.name}</span>}
        description={<>/{b.slug} · {b.category} · {b.city || "no city"} · created {fmtDate(b.createdAt)}</>}
        actions={<Link href={`/b/${b.slug}`} target="_blank" className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-border bg-surface px-4 text-[14px] hover:bg-subtle">Booking page <Icon name="external" size={15} /></Link>}
      />

      <div className="mb-6 flex flex-wrap gap-2">
        <Badge tone={plan?.entitlements.community ? "ai" : "neutral"} icon={plan?.entitlements.community ? "crown" : undefined}>{plan?.name ?? b.tier}</Badge>
        {b.suspended ? <Badge tone="bad">Suspended</Badge> : <Badge tone="ok">Active</Badge>}
        {b.published ? <Badge tone="ok">Published</Badge> : <Badge tone="warn">Unpublished</Badge>}
        {sub && <Badge>Subscription: {sub.status} ({sub.provider})</Badge>}
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Revenue (30d)" value={eur(m.revenueCents)} sub={`${m.bookings} bookings`} />
        <Stat label="Upcoming" value={m.upcoming} sub={eur(m.upcomingRevenueCents)} />
        <Stat label="Conversations (30d)" value={m.conversations} sub={m.resolutionRate === null ? "—" : `${Math.round(m.resolutionRate * 100)}% resolved by agent`} tone="ai" icon="sparkles" />
        <Stat label="Customers" value={m.customers} sub={`${m.newCustomers} new`} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Tenant controls" description="Every action is recorded in the audit log." />
          {!can("businesses.manage") && <p className="px-5 pt-4 text-[13px] text-muted">Read-only for your role.</p>}
          <div className="divide-y divide-border">
            <div className="flex items-center justify-between gap-3 px-5 py-4">
              <div><div className="font-medium">Marketplace listing</div><div className="text-[13px] text-muted">{b.published ? "Visible to customers." : "Hidden from customers."}</div></div>
              {can("businesses.manage") && <form action={adminSetPublished}>
                <Hidden id={b.id} />
                <input type="hidden" name="published" value={String(!b.published)} />
                <SubmitButton size="sm" variant="secondary">{b.published ? "Unpublish" : "Publish"}</SubmitButton>
              </form>}
            </div>
            <div className="flex items-center justify-between gap-3 px-5 py-4">
              <div><div className="font-medium">Suspension</div><div className="text-[13px] text-muted">Suspended businesses can't take bookings and their agent goes silent.</div></div>
              {can("businesses.manage") && <form action={adminSetSuspended}>
                <Hidden id={b.id} />
                <input type="hidden" name="suspended" value={String(!b.suspended)} />
                {b.suspended ? <SubmitButton size="sm" variant="secondary">Unsuspend</SubmitButton> : <ConfirmSubmit message={`Suspend ${b.name}? Bookings and the agent stop immediately.`}>Suspend</ConfirmSubmit>}
              </form>}
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="NanoClaw agent" description={agent ? `${agent.name} · ${agent.model || "platform default model"}` : "No agent provisioned"} />
          <div className="space-y-3 px-5 py-4 text-[14px]">
            {agent ? (
              <>
                <div className="flex justify-between"><span className="text-muted">Status</span><Badge tone={agent.status === "active" ? "ok" : agent.status === "error" ? "bad" : "warn"}>{agent.status}</Badge></div>
                <div className="flex justify-between"><span className="text-muted">Runtime</span><span className="font-mono text-[12px]">{agent.runtimeRef.slice(0, 14)}…</span></div>
                <div className="flex justify-between"><span className="text-muted">Provisioned</span><span>{fmtDate(agent.provisionedAt)}</span></div>
                <div className="flex justify-between"><span className="text-muted">Turns (30d)</span><span className="tabular-nums">{m.agentTurns} · avg {(m.avgLatencyMs / 1000).toFixed(1)}s</span></div>
                <div className="flex justify-between"><span className="text-muted">Pending approvals</span><span className="tabular-nums">{m.pendingApprovals}</span></div>
                {can("agents.manage") && <form action={adminSetAgentStatus} className="pt-1">
                  <Hidden id={b.id} />
                  <input type="hidden" name="status" value={agent.status === "active" ? "paused" : "active"} />
                  <SubmitButton size="sm" variant="secondary" icon={agent.status === "active" ? "pause" : "play"}>{agent.status === "active" ? "Pause agent" : "Resume agent"}</SubmitButton>
                </form>}
              </>
            ) : (
              <form action={adminProvisionAgent}>
                <Hidden id={b.id} />
                <SubmitButton size="sm" variant="ai" icon="sparkles">Provision agent</SubmitButton>
              </form>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Team" description="People who can open this business's workspace." />
          <div className="divide-y divide-border text-[14px]">
            {members.map(({ role, user }) => (
              <div key={user.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                <div className="min-w-0"><Link href={`/admin/users/${user.id}`} className="font-medium hover:underline">{user.name}</Link><div className="text-[12px] text-faint">{user.email}</div></div>
                <div className="flex items-center gap-1">
                  {can("users.manage") ? (
                    <form action={updateMembership} className="flex gap-1">
                      <input type="hidden" name="userId" value={user.id} />
                      <Hidden id={b.id} />
                      <input type="hidden" name="action" value="role" />
                      <Select name="role" defaultValue={role} className="h-8 w-28 text-[13px]"><option value="owner">Owner</option><option value="manager">Manager</option><option value="staff">Staff</option></Select>
                      <SubmitButton size="sm" variant="ghost">Save</SubmitButton>
                    </form>
                  ) : (
                    <Badge className="capitalize">{role}</Badge>
                  )}
                  {can("impersonate") && !user.disabled && !user.platformRole && (
                    <form action={impersonate}>
                      <input type="hidden" name="userId" value={user.id} />
                      <Button size="sm" variant="ghost" icon="eye" title="Sign in as this user">View as</Button>
                    </form>
                  )}
                </div>
              </div>
            ))}
          </div>
          {can("users.manage") && (
            <ActionForm action={addMembership} className="flex flex-wrap items-end gap-2 border-t border-border p-5">
              <input type="hidden" name="businessId" value={b.id} />
              <AddMemberUser />
              <Field label="Role"><Select name="role" defaultValue="staff" className="w-32"><option value="owner">Owner</option><option value="manager">Manager</option><option value="staff">Staff</option></Select></Field>
              <SubmitButton variant="secondary">Add</SubmitButton>
            </ActionForm>
          )}
        </Card>

        <Card>
          <CardHeader title="Channels" />
          <div className="divide-y divide-border text-[14px]">
            {channels.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0"><div className="font-medium capitalize">{c.kind}</div><div className="truncate text-[12px] text-faint">{c.displayName || "—"}{c.lastError ? ` · ${c.lastError}` : ""}</div></div>
                <Badge tone={c.status === "connected" ? "ok" : c.status === "error" ? "bad" : "neutral"}>{c.status}</Badge>
              </div>
            ))}
            {!channels.length && <div className="px-5 py-6 text-center text-muted">No channels</div>}
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {can("businesses.manage") && (
          <Card>
            <CardHeader title="Business details" description="Changing the slug changes the booking page and Telegram links." />
            <ActionForm action={updateBusinessAdmin} className="grid gap-3 p-5 sm:grid-cols-2">
              <Hidden id={b.id} />
              <Field label="Name"><Input name="name" defaultValue={b.name} required /></Field>
              <Field label="Slug"><Input name="slug" defaultValue={b.slug} required /></Field>
              <Field label="Category"><Select name="category" defaultValue={b.category}>{CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</Select></Field>
              <Field label="City"><Input name="city" defaultValue={b.city} /></Field>
              <div className="sm:col-span-2"><SubmitButton size="sm">Save</SubmitButton></div>
            </ActionForm>
          </Card>
        )}
        {can("billing.manage") && (
          <Card>
            <CardHeader title="Plan & subscription" description="Override the plan, status or renewal date (e.g. extend a trial, comp an account)." />
            <ActionForm action={updateSubscriptionAdmin} className="grid gap-3 p-5 sm:grid-cols-3">
              <Hidden id={b.id} />
              <Field label="Plan"><Select name="tier" defaultValue={b.tier}>{plans.map((p) => <option key={p.id} value={p.id}>{p.name}{p.active ? "" : " (archived)"}</option>)}</Select></Field>
              <Field label="Status">
                <Select name="status" defaultValue={sub?.status ?? "active"}><option value="trialing">Trial</option><option value="active">Active</option><option value="past_due">Past due</option><option value="canceled">Canceled</option></Select>
              </Field>
              <Field label="Renews / trial ends"><Input name="periodEnd" type="date" defaultValue={sub?.currentPeriodEnd?.toISOString().slice(0, 10) ?? ""} /></Field>
              <div className="sm:col-span-3"><SubmitButton size="sm">Update subscription</SubmitButton></div>
            </ActionForm>
          </Card>
        )}
      </div>

      <Card className="mt-6">
        <CardHeader title="Recent activity" action={<Link href={`/admin/audit?business=${b.id}`} className="text-[13px] text-muted hover:text-fg">Full log →</Link>} />
        <Table head={["When", "Actor", "Action", "Target"]}>
          {audit.map((a) => (
            <tr key={a.id}>
              <Td className="whitespace-nowrap text-muted">{fmtDate(a.createdAt)}</Td>
              <Td><Badge>{a.actorType}</Badge></Td>
              <Td mono>{a.action}</Td>
              <Td mono>{a.target ?? "—"}</Td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}

function AddMemberUser() {
  return (
    <Field label="Add person by email" className="min-w-56 flex-1">
      <Input name="email" type="email" required placeholder="person@example.com" />
    </Field>
  );
}
