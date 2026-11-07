import Link from "next/link";
import {
  adminDeleteCategory,
  adminModeratePost,
  adminModerateThread,
  adminPostAnnouncement,
  adminResolveReport,
  adminSaveCategory,
} from "@/actions/admin";
import { Table, Td, fmtDate } from "@/components/admin/table";
import { ConfirmSubmit, SubmitButton } from "@/components/client";
import { Badge, Card, CardHeader, Empty, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { requirePlatform } from "@/lib/auth";
import { listCategories, listOpenReports, recentThreadsForModeration } from "@/lib/community";

export const metadata = { title: "Community" };

function Flag({ id, field, value, on, off }: { id: string; field: "hidden" | "pinned" | "locked"; value: boolean; on: string; off: string }) {
  return (
    <form action={adminModerateThread}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="field" value={field} />
      <input type="hidden" name="value" value={String(!value)} />
      <SubmitButton size="sm" variant="ghost">{value ? off : on}</SubmitButton>
    </form>
  );
}

export default async function AdminCommunity() {
  await requirePlatform("community.moderate");
  const [categories, reports, threads] = await Promise.all([listCategories(), listOpenReports(), recentThreadsForModeration(50)]);
  const announceCat = categories.find((c) => c.adminOnlyPosting) ?? categories[0];

  return (
    <>
      <PageHeader eyebrow="Platform" title="Community moderation" description="VIP forum: categories, reports, threads and announcements." actions={<Link href="/app/community" className="inline-flex h-10 items-center rounded-[10px] border border-border bg-surface px-4 text-[14px] hover:bg-subtle">Open forum</Link>} />

      <Card>
        <CardHeader title="Open reports" description={`${reports.length} waiting`} />
        {reports.length ? (
          <div className="divide-y divide-border">
            {reports.map(({ report: r, reporter, postBody, postHidden, threadTitle, threadHidden, threadIdOfPost }) => {
              const threadId = r.threadId ?? threadIdOfPost;
              return (
                <div key={r.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-[13px]">
                      <Badge tone="warn" icon="flag">{r.postId ? "Post" : "Thread"}</Badge>
                      <span className="text-muted">by {reporter} · {fmtDate(r.createdAt)}</span>
                      {threadId && <Link href={`/app/community/t/${threadId}`} className="text-muted underline-offset-4 hover:underline">view</Link>}
                    </div>
                    <div className="mt-1.5 line-clamp-3 text-[14px]">{r.postId ? postBody : threadTitle}</div>
                    <div className="mt-1 text-[13px] text-faint">Reason: {r.reason}</div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {r.postId ? (
                      <form action={adminModeratePost}>
                        <input type="hidden" name="id" value={r.postId} />
                        <input type="hidden" name="hidden" value={String(!postHidden)} />
                        <SubmitButton size="sm" variant="danger">{postHidden ? "Unhide post" : "Hide post"}</SubmitButton>
                      </form>
                    ) : r.threadId ? (
                      <form action={adminModerateThread}>
                        <input type="hidden" name="id" value={r.threadId} />
                        <input type="hidden" name="field" value="hidden" />
                        <input type="hidden" name="value" value={String(!threadHidden)} />
                        <SubmitButton size="sm" variant="danger">{threadHidden ? "Unhide thread" : "Hide thread"}</SubmitButton>
                      </form>
                    ) : null}
                    <form action={adminResolveReport}>
                      <input type="hidden" name="id" value={r.id} />
                      <SubmitButton size="sm" variant="secondary">Dismiss</SubmitButton>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <Empty icon="checkCircle" title="Nothing to review">Reports from members land here.</Empty>
        )}
      </Card>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Post an announcement" description="Pinned announcements appear at the top of the category." />
          {announceCat ? (
            <form action={adminPostAnnouncement} className="space-y-4 p-5">
              <Field label="Category">
                <Select name="categoryId" defaultValue={announceCat.id}>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </Field>
              <Field label="Title"><Input name="title" required minLength={3} maxLength={160} /></Field>
              <Field label="Message"><Textarea name="body" required className="min-h-32" /></Field>
              <div className="flex flex-wrap gap-5 text-[14px]">
                <label className="flex items-center gap-2"><input type="checkbox" name="pinned" defaultChecked className="size-4 accent-current" /> Pin</label>
                <label className="flex items-center gap-2"><input type="checkbox" name="notify" defaultChecked className="size-4 accent-current" /> Notify all VIP businesses</label>
              </div>
              <SubmitButton icon="send">Publish announcement</SubmitButton>
            </form>
          ) : (
            <Empty icon="chat" title="Create a category first" />
          )}
        </Card>

        <Card>
          <CardHeader title="Categories" />
          <div className="divide-y divide-border">
            {categories.map((c) => (
              <details key={c.id} className="group px-5 py-3">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-medium">{c.name}{c.adminOnlyPosting && <Badge tone="solid">Admin posts only</Badge>}</div>
                    <div className="text-[12px] text-faint">/{c.slug} · {c.threads} threads · order {c.sortOrder}</div>
                  </div>
                  <span className="text-[13px] text-muted group-open:hidden">Edit</span>
                </summary>
                <form action={adminSaveCategory} className="mt-3 grid gap-3 sm:grid-cols-2">
                  <input type="hidden" name="id" value={c.id} />
                  <Field label="Name"><Input name="name" defaultValue={c.name} required /></Field>
                  <Field label="Slug"><Input name="slug" defaultValue={c.slug} /></Field>
                  <Field label="Description" className="sm:col-span-2"><Input name="description" defaultValue={c.description} /></Field>
                  <Field label="Sort order"><Input name="sortOrder" type="number" min={0} defaultValue={c.sortOrder} /></Field>
                  <label className="flex items-end gap-2 pb-2 text-[14px]"><input type="checkbox" name="adminOnlyPosting" defaultChecked={c.adminOnlyPosting} className="size-4" /> Only admins can post</label>
                  <div className="flex gap-2 sm:col-span-2">
                    <SubmitButton size="sm">Save</SubmitButton>
                  </div>
                </form>
                <form action={adminDeleteCategory} className="mt-2">
                  <input type="hidden" name="id" value={c.id} />
                  <ConfirmSubmit message={`Delete “${c.name}” and all of its ${c.threads} threads? This can't be undone.`} icon="trash">Delete category</ConfirmSubmit>
                </form>
              </details>
            ))}
          </div>
          <form action={adminSaveCategory} className="grid gap-3 border-t border-border p-5 sm:grid-cols-2">
            <div className="text-[13px] font-medium sm:col-span-2">New category</div>
            <Field label="Name"><Input name="name" required /></Field>
            <Field label="Slug" hint="optional"><Input name="slug" /></Field>
            <Field label="Description" className="sm:col-span-2"><Input name="description" /></Field>
            <Field label="Sort order"><Input name="sortOrder" type="number" min={0} defaultValue={categories.length} /></Field>
            <label className="flex items-end gap-2 pb-2 text-[14px]"><input type="checkbox" name="adminOnlyPosting" className="size-4" /> Only admins can post</label>
            <div className="sm:col-span-2"><SubmitButton size="sm" icon="plus">Add category</SubmitButton></div>
          </form>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Recent threads" />
        <Table head={["Thread", "Category", "Author", "Activity", "Flags", ""]}>
          {threads.map((th) => (
            <tr key={th.id} className="hover:bg-subtle/50">
              <Td><Link href={`/app/community/t/${th.id}`} className="font-medium hover:underline">{th.title}</Link></Td>
              <Td className="text-muted">{th.categoryName}</Td>
              <Td className="text-muted">{th.authorName}</Td>
              <Td className="whitespace-nowrap text-muted">{fmtDate(th.lastActivityAt)}</Td>
              <Td>
                <div className="flex flex-wrap gap-1">
                  {th.pinned && <Badge tone="ai">Pinned</Badge>}
                  {th.locked && <Badge>Locked</Badge>}
                  {th.hidden && <Badge tone="bad">Hidden</Badge>}
                </div>
              </Td>
              <Td>
                <div className="flex justify-end">
                  <Flag id={th.id} field="pinned" value={th.pinned} on="Pin" off="Unpin" />
                  <Flag id={th.id} field="locked" value={th.locked} on="Lock" off="Unlock" />
                  <Flag id={th.id} field="hidden" value={th.hidden} on="Hide" off="Unhide" />
                </div>
              </Td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
