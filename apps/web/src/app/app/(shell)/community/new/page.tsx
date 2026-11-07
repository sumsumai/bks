import Link from "next/link";
import { createThread } from "@/actions/community";
import { SubmitButton } from "@/components/client";
import { Icon } from "@/components/icons";
import { LockedCommunity } from "@/components/community/parts";
import { Card, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { canAccessCommunity, listCategories, isCommunityModerator } from "@/lib/community";
import { currentTenant } from "@/lib/tenant";

export const metadata = { title: "New discussion" };

export default async function NewThreadPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const t = await currentTenant();
  if (!(await canAccessCommunity(t))) return <LockedCommunity />;
  const { category } = await searchParams;
  const isAdmin = isCommunityModerator(t.user);
  const categories = (await listCategories()).filter((c) => !c.adminOnlyPosting || isAdmin);
  const selected = categories.find((c) => c.slug === category)?.id ?? categories[0]?.id;
  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/app/community" className="mb-3 inline-flex items-center gap-1 text-[13px] text-muted hover:text-fg"><Icon name="chevronLeft" size={14} /> Community</Link>
      <PageHeader title="Start a discussion" description="Visible only to verified VIP businesses and the platform team." />
      <Card className="p-6">
        <form action={createThread} className="space-y-5">
          <Field label="Category">
            <Select name="categoryId" defaultValue={selected} required>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Title"><Input name="title" required minLength={3} maxLength={160} placeholder="What do you want to discuss?" /></Field>
          <Field label="Details"><Textarea name="body" required className="min-h-48" placeholder="Context, what you tried, what you'd like to learn…" /></Field>
          <div className="flex justify-end gap-2">
            <SubmitButton icon="send">Post discussion</SubmitButton>
          </div>
        </form>
      </Card>
    </div>
  );
}
