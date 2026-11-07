import { sql } from "drizzle-orm";
import Link from "next/link";
import { adminSetUserDisabled } from "@/actions/admin";
import { createUser } from "@/actions/admin-platform";
import { ActionForm } from "@/components/workspace/action-form";
import { CardHeader, Field, Select } from "@/components/ui";
import { ROLE_INFO, PLATFORM_ROLES, isPlatformRole, platformCan } from "@/lib/platform-rbac";
import { Table, Td, fmtDate } from "@/components/admin/table";
import { ConfirmSubmit, SubmitButton } from "@/components/client";
import { Badge, Card, Input, PageHeader } from "@/components/ui";
import { db } from "@/db";
import { requirePlatform } from "@/lib/auth";

export const metadata = { title: "Users" };

type Row = { id: string; name: string; email: string; platform_role: string | null; disabled: boolean; created_at: string; businesses: string | null; last_seen: string | null };

export default async function AdminUsers({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const me = await requirePlatform("users.view");
  const canManage = platformCan(me.platformRole, "users.manage");
  const canStaff = platformCan(me.platformRole, "staff.manage");
  const { q = "" } = await searchParams;
  const like = `%${q.toLowerCase()}%`;
  const rows = (
    await db.execute(sql`
      select u.id, u.name, u.email, u.platform_role, u.disabled, u.created_at,
        (select string_agg(b.name || ' (' || m.role || ')', ', ') from memberships m join businesses b on b.id = m.business_id where m.user_id = u.id) as businesses,
        (select max(s.created_at) from sessions s where s.user_id = u.id) as last_seen
      from users u
      where ${q} = '' or lower(u.name) like ${like} or lower(u.email) like ${like}
      order by u.created_at desc limit 300`)
  ).rows as Row[];
  return (
    <>
      <PageHeader eyebrow="Platform" title="Users" description={`${rows.length} shown`} />
      {canManage && (
        <Card className="mb-6">
          <details>
            <summary className="cursor-pointer list-none px-5 py-4 font-semibold">+ New user</summary>
            <ActionForm action={createUser} className="grid gap-3 border-t border-border p-5 sm:grid-cols-2" resetOnSuccess>
              <Field label="Name"><Input name="name" required /></Field>
              <Field label="Email"><Input name="email" type="email" required /></Field>
              <Field label="Password" hint="blank = generate"><Input name="password" type="text" autoComplete="off" /></Field>
              <Field label="Add to business" hint="slug or id, optional"><Input name="businessRef" placeholder="atelier-nord" /></Field>
              <Field label="Business role">
                <Select name="businessRole" defaultValue="staff"><option value="owner">Owner</option><option value="manager">Manager</option><option value="staff">Staff</option></Select>
              </Field>
              {canStaff && (
                <Field label="Platform role" hint="staff only">
                  <Select name="platformRole" defaultValue=""><option value="">None (business user)</option>{PLATFORM_ROLES.map((r) => <option key={r} value={r}>{ROLE_INFO[r].label}</option>)}</Select>
                </Field>
              )}
              <div className="sm:col-span-2"><SubmitButton>Create user</SubmitButton></div>
            </ActionForm>
          </details>
        </Card>
      )}
      <form className="mb-4 flex gap-2">
        <Input name="q" defaultValue={q} placeholder="Search name or email…" className="max-w-sm" />
        <button className="h-10 rounded-[10px] border border-border bg-surface px-4 text-[14px] hover:bg-subtle">Search</button>
      </form>
      <Card>
        <Table head={["User", "Businesses", "Platform role", "Status", "Last sign-in", ""]}>
          {rows.map((u) => {
            const self = u.id === me.id;
            return (
              <tr key={u.id} className="hover:bg-subtle/50">
                <Td><Link href={`/admin/users/${u.id}`} className="font-medium hover:underline">{u.name}</Link>{self && <span className="ml-1.5 text-[12px] text-faint">(you)</span>}<div className="text-[12px] text-faint">{u.email}</div></Td>
                <Td className="max-w-64 truncate text-muted">{u.businesses ?? "—"}</Td>
                <Td>{isPlatformRole(u.platform_role) ? <Badge tone="solid" icon="shield">{ROLE_INFO[u.platform_role].label}</Badge> : <Badge>Business user</Badge>}</Td>
                <Td>{u.disabled ? <Badge tone="bad">Disabled</Badge> : <Badge tone="ok">Active</Badge>}</Td>
                <Td className="whitespace-nowrap text-muted">{fmtDate(u.last_seen)}</Td>
                <Td>
                  {!self && canManage && (
                    <div className="flex justify-end gap-2">
                      <form action={adminSetUserDisabled}>
                        <input type="hidden" name="userId" value={u.id} />
                        <input type="hidden" name="disabled" value={String(!u.disabled)} />
                        {u.disabled ? <SubmitButton size="sm" variant="secondary">Enable</SubmitButton> : <ConfirmSubmit message={`Disable ${u.email}? All their sessions end now.`}>Disable</ConfirmSubmit>}
                      </form>
                    </div>
                  )}
                </Td>
              </tr>
            );
          })}
        </Table>
      </Card>
    </>
  );
}
