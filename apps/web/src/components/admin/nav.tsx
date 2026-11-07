"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { PlatformPermission } from "@/lib/platform-rbac";
import { Icon, type IconName } from "../icons";
import { cx } from "../ui";

type Item = { href: string; label: string; icon: IconName; perm: PlatformPermission; section?: string };

const ITEMS: Item[] = [
  { href: "/admin", label: "Overview", icon: "chart", perm: "overview.view" },
  { href: "/admin/businesses", label: "Businesses", icon: "building", perm: "businesses.view", section: "Customers" },
  { href: "/admin/users", label: "Users", icon: "users", perm: "users.view", section: "Customers" },
  { href: "/admin/agents", label: "AI agents", icon: "sparkles", perm: "businesses.view", section: "Customers" },
  { href: "/admin/plans", label: "Plans & pricing", icon: "card", perm: "plans.manage", section: "Revenue" },
  { href: "/admin/payments", label: "Subscriptions", icon: "chart", perm: "billing.view", section: "Revenue" },
  { href: "/admin/telegram", label: "Telegram bot", icon: "telegram", perm: "channels.manage", section: "Channels" },
  { href: "/admin/whatsapp", label: "WhatsApp", icon: "whatsapp", perm: "channels.manage", section: "Channels" },
  { href: "/admin/community", label: "Community", icon: "crown", perm: "community.moderate", section: "Community" },
  { href: "/admin/settings", label: "Settings", icon: "settings", perm: "settings.manage", section: "Platform" },
  { href: "/admin/access", label: "Team & access", icon: "shield", perm: "staff.manage", section: "Platform" },
  { href: "/admin/integrations", label: "System status", icon: "plug", perm: "settings.manage", section: "Platform" },
  { href: "/admin/audit", label: "Audit log", icon: "book", perm: "audit.view", section: "Platform" },
];

export function AdminNav({ permissions }: { permissions: PlatformPermission[] }) {
  const path = usePathname();
  const items = ITEMS.filter((i) => permissions.includes(i.perm));
  let last: string | undefined;
  return (
    <nav className="flex gap-0.5 overflow-x-auto scrollbar-none lg:flex-col">
      {items.map((it) => {
        const active = it.href === "/admin" ? path === "/admin" : path === it.href || path.startsWith(`${it.href}/`);
        const header = it.section && it.section !== last ? it.section : null;
        last = it.section ?? last;
        return (
          <div key={it.href} className="shrink-0 lg:shrink">
            {header && <div className="mt-4 mb-1 hidden px-3 text-[11px] font-medium uppercase tracking-wider text-faint lg:block">{header}</div>}
            <Link
              href={it.href}
              className={cx(
                "flex h-9 items-center gap-2.5 rounded-lg px-3 text-[14px] transition",
                active ? "bg-surface font-medium text-fg shadow-card ring-1 ring-border" : "text-muted hover:bg-surface/60 hover:text-fg",
              )}
            >
              <Icon name={it.icon} size={17} className={active ? "text-fg" : "text-faint"} />
              {it.label}
            </Link>
          </div>
        );
      })}
    </nav>
  );
}
