import { isNotNull } from "drizzle-orm";
import Link from "next/link";
import { grantAccessByEmail, setPlatformRole } from "@/actions/admin-platform";
import { Table, Td, fmtDate } from "@/components/admin/table";
import { ConfirmSubmit, SubmitButton } from "@/components/client";
import { Icon } from "@/components/icons";
import { Badge, Card, CardHeader, Field, Input, PageHeader, Select } from "@/components/ui";
import { ActionForm } from "@/components/workspace/action-form";
import { db, schema } from "@/db";
import { requirePlatform } from "@/lib/auth";
import { PERMISSION_LABEL, PLATFORM_ROLES, ROLE_INFO, type PlatformPermission } from "@/lib/platform-rbac";

export const metadata = { title: "Team & access" };

export default async function AdminAccess() {
  const me = await requirePlatform("staff.manage");
  const staff = await db.select().from(schema.users).where(isNotNull(schema.users.platformRole)).orderBy(schema.users.name);
  const perms = Object.keys(PERMISSION_LABEL) as PlatformPermission[];
  return (
    <>
      <PageHeader eyebrow="Platform" title="Team & access" description="Who can open this admin, and what each role allows. Business owners and their teams are managed per business." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title={`Platform team (${staff.length})`} />
          <Table head={["Person", "Role", "Since", ""]}>
            {staff.map((u) => (
              <tr key={u.id}>
                <Td><Link href={`/admin/users/${u.id}`} className="font-medium hover:underline">{u.name}</Link>{u.id === me.id && <span className="ml-1.5 text-[12px] text-faint">(you)</span>}<div className="text-[12px] text-faint">{u.email}</div></Td>
                <Td>
                  {u.id === me.id ? (
                    <Badge tone="solid">{ROLE_INFO[u.platformRole!].label}</Badge>
                  ) : (
                    <form action={setPlatformRole} className="flex gap-2">
                      <input type="hidden" name="userId" value={u.id} />
                      <Select name="role" defaultValue={u.platformRole!} className="h-8 w-40 text-[13px]">
                        {PLATFORM_ROLES.map((r) => <option key={r} value={r}>{ROLE_INFO[r].label}</option>)}
                      </Select>
                      <SubmitButton size="sm" variant="ghost">Change</SubmitButton>
                    </form>
                  )}
                </Td>
                <Td className="whitespace-nowrap text-muted">{fmtDate(u.createdAt)}</Td>
                <Td>
                  {u.id !== me.id && (
                    <form action={setPlatformRole} className="flex justify-end">
                      <input type="hidden" name="userId" value={u.id} />
                      <input type="hidden" name="role" value="" />
                      <ConfirmSubmit variant="ghost" message={`Remove ${u.name}'s platform access? They keep their business accounts.`}>Remove access</ConfirmSubmit>
                    </form>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        </Card>
        <Card className="h-fit">
          <CardHeader title="Give access" description="The person needs an account (create one in Users)." />
          <ActionForm action={grantAccessByEmail} className="space-y-3 p-5" resetOnSuccess>
            <Field label="Email"><Input name="email" type="email" required /></Field>
            <Field label="Role">
              <Select name="role" defaultValue="support">{PLATFORM_ROLES.map((r) => <option key={r} value={r}>{ROLE_INFO[r].label}</option>)}</Select>
            </Field>
            <SubmitButton>Grant access</SubmitButton>
          </ActionForm>
        </Card>

        <Card className="overflow-x-auto lg:col-span-3">
          <CardHeader title="What each role can do" />
          <table className="w-full text-[13px]">
            <thead className="border-b border-border text-left text-faint">
              <tr>
                <th className="px-5 py-3 font-medium">Permission</th>
                {PLATFORM_ROLES.map((r) => <th key={r} className="px-3 py-3 text-center font-medium">{ROLE_INFO[r].label}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {perms.map((p) => (
                <tr key={p}>
                  <td className="px-5 py-2">{PERMISSION_LABEL[p]}</td>
                  {PLATFORM_ROLES.map((r) => (
                    <td key={r} className="px-3 py-2 text-center">{ROLE_INFO[r].permissions.includes(p) ? <Icon name="check" size={15} className="inline text-ok" /> : <span className="text-faint">·</span>}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="grid gap-3 border-t border-border p-5 sm:grid-cols-2 lg:grid-cols-5">
            {PLATFORM_ROLES.map((r) => (
              <div key={r} className="text-[13px]"><div className="font-medium">{ROLE_INFO[r].label}</div><div className="text-muted">{ROLE_INFO[r].description}</div></div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
