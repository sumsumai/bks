import Link from "next/link";
import { logout, switchBusiness } from "@/actions/auth";
import { LiveEvents } from "@/components/client";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { Icon } from "@/components/icons";
import { Avatar, Badge, Logo } from "@/components/ui";
import { MobileNav, Nav, type NavItem } from "@/components/workspace/nav";
import { can } from "@/lib/rbac";
import { planOf } from "@/lib/plans";
import { isPlatformRole } from "@/lib/platform-rbac";
import { unreadCounts } from "@/lib/queries";
import { currentTenant, membershipsOf } from "@/lib/tenant";

export default async function ShellLayout({ children }: { children: React.ReactNode }) {
  const t = await currentTenant();
  const [counts, memberships] = await Promise.all([unreadCounts(t.business.id), membershipsOf(t.user.id)]);
  const [{ plan, entitlements }] = await Promise.all([planOf(t.business)]);
  const vip = entitlements.community;

  const items: NavItem[] = [
    { href: "/app", label: "Overview", icon: "home" },
    { href: "/app/bookings", label: "Bookings", icon: "calendar" },
    { href: "/app/inbox", label: "Inbox", icon: "inbox", badge: counts.escalations },
    ...(can(t.role, "agent.approve") ? [{ href: "/app/approvals", label: "Approvals", icon: "checkCircle" as const, badge: counts.approvals }] : []),
    { href: "/app/customers", label: "Customers", icon: "users" },
    ...(can(t.role, "agent.manage")
      ? [
          { href: "/app/agent", label: "Agent", icon: "sparkles" as const, section: "NanoClaw" },
          { href: "/app/agent/knowledge", label: "Knowledge", icon: "book" as const, section: "NanoClaw" },
          { href: "/app/channels", label: "Channels", icon: "plug" as const, section: "NanoClaw" },
        ]
      : []),
    ...(can(t.role, "catalog.manage")
      ? [
          { href: "/app/services", label: "Services", icon: "scissors" as const, section: "Business" },
          { href: "/app/team", label: "Team & hours", icon: "clock" as const, section: "Business" },
        ]
      : []),
    ...(can(t.role, "business.manage")
      ? [
          { href: "/app/settings", label: "Settings", icon: "settings" as const, section: "Business" },
          { href: "/app/billing", label: "Plan & billing", icon: "card" as const, section: "Business" },
        ]
      : []),
    { href: "/app/community", label: "VIP community", icon: "crown", section: "Community", locked: !vip },
  ];

  const switcher = (
    <div className="mb-4 rounded-card border border-border bg-surface p-3 shadow-card">
      <div className="flex items-center gap-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg text-[14px] font-semibold text-white" style={{ background: t.business.brandColor }}>
          {t.business.name[0]}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-semibold">{t.business.name}</div>
          <div className="flex items-center gap-1.5 text-[12px] text-muted">
            {vip ? <Badge tone="ai" icon="crown">{plan?.name ?? "VIP"}</Badge> : <span>{plan?.name ?? t.business.tier}</span>}
            <span className="capitalize">· {t.role}</span>
          </div>
        </div>
      </div>
      {memberships.length > 1 && (
        <form action={switchBusiness} className="mt-2.5">
          <select name="businessId" defaultValue={t.business.id} className="h-8 w-full rounded-md border border-border bg-subtle px-2 text-[13px]" onChange={undefined}>
            {memberships.map((m) => (
              <option key={m.business.id} value={m.business.id}>{m.business.name}</option>
            ))}
          </select>
          <button className="mt-1.5 w-full rounded-md bg-subtle py-1 text-[12px] text-muted hover:text-fg">Switch business</button>
        </form>
      )}
      <Link href={`/b/${t.business.slug}`} target="_blank" className="mt-2.5 flex items-center justify-between rounded-md bg-subtle px-2.5 py-1.5 text-[12px] text-muted hover:text-fg">
        <span className="truncate">/b/{t.business.slug}</span>
        <Icon name="external" size={13} />
      </Link>
    </div>
  );

  const footer = (
    <div className="mt-auto flex items-center gap-2.5 border-t border-border pt-4">
      <Avatar name={t.user.name} color="#52525b" size={30} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium">{t.user.name}</div>
        <div className="truncate text-[12px] text-faint">{t.user.email}</div>
      </div>
      {isPlatformRole(t.user.platformRole) && (
        <Link href="/admin" title="Platform admin" className="rounded-md p-1.5 text-faint hover:bg-subtle hover:text-fg"><Icon name="shield" size={16} /></Link>
      )}
      <form action={logout}>
        <button title="Sign out" className="rounded-md p-1.5 text-faint hover:bg-subtle hover:text-fg"><Icon name="logout" size={16} /></button>
      </form>
    </div>
  );

  return (
    <>
    <ImpersonationBanner />
    <div className="min-h-dvh lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col overflow-y-auto border-r border-border bg-subtle/60 px-4 py-5 lg:flex">
        <Link href="/app" className="mb-5 px-1"><Logo /></Link>
        {switcher}
        <Nav items={items} />
        <div className="h-6" />
        {footer}
      </aside>
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-bg/90 px-4 backdrop-blur lg:hidden">
        <Link href="/app"><Logo /></Link>
        <MobileNav items={items}>{switcher}</MobileNav>
      </header>
      <main className="min-w-0 px-4 py-6 sm:px-8 lg:py-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
      <LiveEvents />
    </div>
    </>
  );
}
