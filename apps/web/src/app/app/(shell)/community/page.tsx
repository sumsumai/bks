import Link from "next/link";
import { Icon } from "@/components/icons";
import { LockedCommunity, relative } from "@/components/community/parts";
import { Badge, Card, LinkButton, PageHeader } from "@/components/ui";
import { canAccessCommunity, listCategories } from "@/lib/community";
import { currentTenant } from "@/lib/tenant";

export const metadata = { title: "VIP community" };

export default async function CommunityPage() {
  const t = await currentTenant();
  if (!(await canAccessCommunity(t))) {
    return (
      <>
        <PageHeader eyebrow="Community" title="VIP community" />
        <LockedCommunity />
      </>
    );
  }
  const categories = await listCategories();
  return (
    <>
      <PageHeader
        eyebrow="Community"
        title="VIP community"
        description="A private, moderated space for verified VIP businesses."
        actions={<LinkButton href="/app/community/new" icon="plus">New discussion</LinkButton>}
      />
      <Card className="divide-y divide-border">
        {categories.map((c) => (
          <Link key={c.id} href={`/app/community/c/${c.slug}`} className="flex items-center gap-4 px-5 py-4 transition hover:bg-subtle/60">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-subtle text-muted">
              <Icon name={c.adminOnlyPosting ? "bell" : "chat"} size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 font-medium">
                {c.name}
                {c.adminOnlyPosting && <Badge tone="solid">Official</Badge>}
              </div>
              <div className="truncate text-[13px] text-muted">{c.description}</div>
            </div>
            <div className="hidden text-right text-[13px] sm:block">
              <div className="tabular-nums">{c.threads} {c.threads === 1 ? "discussion" : "discussions"}</div>
              <div className="text-faint">{c.lastActivity ? `Active ${relative(c.lastActivity)}` : "No activity yet"}</div>
            </div>
            <Icon name="chevronRight" size={16} className="text-faint" />
          </Link>
        ))}
        {!categories.length && <div className="px-5 py-10 text-center text-muted">No categories yet.</div>}
      </Card>
    </>
  );
}
