import Link from "next/link";
import { replyToThread, reportContent } from "@/actions/community";
import { SubmitButton } from "@/components/client";
import { Icon } from "@/components/icons";
import { Author, LockedCommunity, Prose } from "@/components/community/parts";
import { Badge, Card, Textarea } from "@/components/ui";
import { canAccessCommunity, getThread, isCommunityModerator } from "@/lib/community";
import { currentTenant } from "@/lib/tenant";

function ReportButton({ threadId, postId }: { threadId: string; postId?: string }) {
  return (
    <form action={reportContent}>
      <input type="hidden" name="threadId" value={threadId} />
      {postId && <input type="hidden" name="postId" value={postId} />}
      <input type="hidden" name="reason" value="Reported by a member" />
      <button className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] text-faint hover:bg-subtle hover:text-fg" title="Report to moderators">
        <Icon name="flag" size={13} /> Report
      </button>
    </form>
  );
}

export default async function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await currentTenant();
  if (!(await canAccessCommunity(t))) return <LockedCommunity />;
  const { id } = await params;
  const thread = await getThread(id, { includeHidden: isCommunityModerator(t.user) });
  const isAdmin = isCommunityModerator(t.user);
  return (
    <div className="mx-auto max-w-3xl">
      <Link href={`/app/community/c/${thread.category.slug}`} className="mb-3 inline-flex items-center gap-1 text-[13px] text-muted hover:text-fg">
        <Icon name="chevronLeft" size={14} /> {thread.category.name}
      </Link>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {thread.pinned && <Badge tone="ai" icon="pin">Pinned</Badge>}
        {thread.locked && <Badge icon="lock">Locked</Badge>}
      </div>
      <h1 className="text-[28px] font-semibold leading-tight tracking-tight">{thread.title}</h1>

      <Card className="mt-5 p-5">
        <div className="flex items-start justify-between gap-3">
          <Author name={thread.authorName} business={thread.businessName} date={thread.createdAt} />
          <ReportButton threadId={thread.id} />
        </div>
        <div className="mt-4"><Prose text={thread.body} /></div>
      </Card>

      <div className="mt-6 mb-3 text-[13px] font-medium text-muted">{thread.posts.length} {thread.posts.length === 1 ? "reply" : "replies"}</div>
      <div className="space-y-3">
        {thread.posts.map((p) => (
          <Card key={p.id} className="p-5">
            <div className="flex items-start justify-between gap-3">
              <Author name={p.authorName} business={p.businessName} date={p.createdAt} />
              <ReportButton threadId={thread.id} postId={p.id} />
            </div>
            <div className="mt-3"><Prose text={p.body} /></div>
          </Card>
        ))}
      </div>

      <Card className="mt-6 p-5">
        {thread.locked && !isAdmin ? (
          <div className="flex items-center gap-2 text-[14px] text-muted"><Icon name="lock" size={16} /> This discussion is locked by a moderator.</div>
        ) : (
          <form action={replyToThread} className="space-y-3">
            <input type="hidden" name="threadId" value={thread.id} />
            <Textarea name="body" required placeholder="Share your experience…" maxLength={20000} />
            <div className="flex items-center justify-between gap-3">
              <span className="text-[12px] text-faint">Posting as {t.user.name} · {t.business.name}</span>
              <SubmitButton icon="send">Reply</SubmitButton>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
