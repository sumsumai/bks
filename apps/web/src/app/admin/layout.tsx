import Link from "next/link";
import { logout } from "@/actions/auth";
import { AdminNav } from "@/components/admin/nav";
import { Icon } from "@/components/icons";
import { Avatar, Badge, Logo } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { ROLE_INFO, type PlatformRole } from "@/lib/platform-rbac";

export const metadata = { title: { default: "Platform admin", template: "%s · Admin · BKS" } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="border-b border-border bg-subtle/60 px-4 py-4 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:border-r lg:border-b-0 lg:py-5">
        <div className="mb-4 flex items-center justify-between px-1 lg:mb-6">
          <Link href="/admin" className="flex items-center gap-2"><Logo /><Badge tone="solid">{ROLE_INFO[admin.platformRole as PlatformRole].label}</Badge></Link>
        </div>
        <AdminNav permissions={ROLE_INFO[admin.platformRole as PlatformRole].permissions} />
        <div className="mt-auto hidden border-t border-border pt-4 lg:block">
          <Link href="/app" className="mb-3 flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-muted hover:bg-surface hover:text-fg">
            <Icon name="chevronLeft" size={15} /> Back to workspace
          </Link>
          <div className="flex items-center gap-2.5">
            <Avatar name={admin.name} color="#18181b" size={30} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium">{admin.name}</div>
              <div className="truncate text-[12px] text-faint">{admin.email}</div>
            </div>
            <form action={logout}>
              <button title="Sign out" className="rounded-md p-1.5 text-faint hover:bg-subtle hover:text-fg"><Icon name="logout" size={16} /></button>
            </form>
          </div>
        </div>
      </aside>
      <main className="min-w-0 px-4 py-6 sm:px-8 lg:py-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
