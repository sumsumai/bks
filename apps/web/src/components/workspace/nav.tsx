"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "../icons";
import { cx } from "../ui";

export type NavItem = { href: string; label: string; icon: IconName; badge?: number; locked?: boolean; section?: string };

export function Nav({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const path = usePathname();
  let lastSection: string | undefined;
  return (
    <nav className="flex flex-col gap-0.5">
      {items.map((it) => {
        const active = it.href === "/app" ? path === "/app" : path === it.href || path.startsWith(`${it.href}/`);
        const header = it.section && it.section !== lastSection ? it.section : null;
        lastSection = it.section ?? lastSection;
        return (
          <div key={it.href}>
            {header && <div className="mt-5 mb-1.5 px-3 text-[11px] font-medium uppercase tracking-wider text-faint">{header}</div>}
            <Link
              href={it.href}
              onClick={onNavigate}
              className={cx(
                "flex h-9 items-center gap-2.5 rounded-lg px-3 text-[14px] transition",
                active ? "bg-surface font-medium text-fg shadow-card ring-1 ring-border" : "text-muted hover:bg-surface/60 hover:text-fg",
              )}
            >
              <Icon name={it.icon} size={17} className={active ? "text-fg" : "text-faint"} />
              <span className="flex-1">{it.label}</span>
              {it.locked && <Icon name="lock" size={13} className="text-faint" />}
              {!!it.badge && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-ai px-1.5 text-[11px] font-semibold text-white">{it.badge}</span>}
            </Link>
          </div>
        );
      })}
    </nav>
  );
}

export function MobileNav({ items, children }: { items: NavItem[]; children: React.ReactNode }) {
  return (
    <details className="group lg:hidden">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-[14px]">
        <Icon name="menu" size={17} /> Menu
      </summary>
      <div className="fixed inset-0 top-14 z-40 overflow-y-auto bg-bg p-4">
        {children}
        <Nav items={items} onNavigate={() => document.querySelectorAll("details[open]").forEach((d) => d.removeAttribute("open"))} />
      </div>
    </details>
  );
}
