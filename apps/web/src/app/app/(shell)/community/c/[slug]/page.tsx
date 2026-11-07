import Link from "next/link";
import { Icon } from "@/components/icons";
import { LockedCommunity, relative } from "@/components/community/parts";
import { Badge, Card, Empty, LinkButton, PageHeader } from "@/components/ui";
import { canAccessCommunity, getCategoryBySlug, listThreads, isCommunityModerator } from "@/lib/community";
import { currentTenant } from "@/lib/tenant";

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const t = await currentTenant();
  if (!(await canAccessCommunity(t))) return <LockedCommunity />;
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  const threads = await listThreads(category.id);
  const canPost = !category.adminOnlyPosting || isCommunityModerator(t.user);
  return (
    <>
      <Link href="/app/community" className="mb-3 inline-flex items-center gap-1 text-[13px] text-muted hover:text-fg"><Icon name="chevronLeft" size={14} /> Community</Link>
      <PageHeader
        title={category.name}
        description={category.description}
        actions={canPost ? <LinkButton href={`/app/community/new?category=${category.slug}`} icon="plus">New discussion</LinkButton> : undefined}
      />
      <Card className="divide-y divide-border">
        {threads.map((th) => (
          <Link key={th.id} href={`/app/community/t/${th.id}`} className="flex items-start gap-4 px-5 py-4 transition hover:bg-subtle/60">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                {th.pinned && <Badge tone="ai" icon="pin">Pinned</Badge>}
                {th.locked && <Badge icon="lock">Locked</Badge>}
                <span className="font-medium">{th.title}</span>
              </div>
              <div className="mt-1 line-clamp-1 text-[14px] text-muted">{th.body}</div>
              <div className="mt-1.5 text-[12px] text-faint">
                {th.authorName}{th.businessName ? ` · ${th.businessName}` : " · Platform team"} · {relative(th.lastActivityAt)}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1 text-[13px] text-muted tabular-nums"><Icon name="chat" size={14} /> {th.replies}</div>
          </Link>
        ))}
        {!threads.length && <Empty icon="chat" title="No discussions yet">Start the first one.</Empty>}
      </Card>
    </>
  );
}
