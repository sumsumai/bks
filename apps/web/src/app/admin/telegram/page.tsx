import { and, count, eq, gte, isNotNull } from "drizzle-orm";
import Link from "next/link";
import { disconnectTelegramBot, registerTelegramWebhookAction, rotateTelegramSecret, saveTelegramBot, saveTelegramProfile } from "@/actions/admin-platform";
import { SettingsForm } from "@/components/admin/settings-form";
import { SubmitButton } from "@/components/client";
import { Badge, Card, CardHeader, Field, Input, PageHeader, Stat, Textarea } from "@/components/ui";
import { ActionForm } from "@/components/workspace/action-form";
import { db, schema } from "@/db";
import { requirePlatform } from "@/lib/auth";
import { telegramGetMe, telegramGetProfile, telegramWebhookInfo } from "@/lib/channels/telegram";
import { describeSettings, getSettings } from "@/lib/settings";

export const metadata = { title: "Telegram bot" };

export default async function AdminTelegram() {
  await requirePlatform("channels.manage");
  const settings = await getSettings();
  const rows = (await describeSettings()).filter((r) => r.key === "telegram.enabled");
  const token = settings["telegram.botToken"];
  const appUrl = settings["general.appUrl"] ?? "";
  const expectedUrl = `${appUrl.replace(/\/$/, "")}/api/webhooks/telegram`;

  const live = token
    ? await Promise.all([telegramGetMe(), telegramWebhookInfo(), telegramGetProfile()])
        .then(([me, hook, profile]) => ({ me, hook, profile }))
        .catch((e) => ({ error: String(e?.message ?? e) }))
    : null;

  const weekAgo = new Date(Date.now() - 7 * 86400_000);
  const [[biz], [chats], [msgs]] = await Promise.all([
    db.select({ n: count() }).from(schema.channels).where(and(eq(schema.channels.kind, "telegram"), eq(schema.channels.status, "connected"))),
    db.select({ n: count() }).from(schema.telegramChats).where(isNotNull(schema.telegramChats.activeBusinessId)),
    db
      .select({ n: count() })
      .from(schema.messages)
      .innerJoin(schema.conversations, eq(schema.conversations.id, schema.messages.conversationId))
      .where(and(eq(schema.conversations.channel, "telegram"), gte(schema.messages.createdAt, weekAgo))),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Channels"
        title="Telegram bot"
        description="One bot serves every business. Customers open a business through t.me/<bot>?start=<slug> and can switch with /switch."
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Businesses on Telegram" value={Number(biz.n)} icon="building" />
        <Stat label="Customer chats" value={Number(chats.n)} icon="users" />
        <Stat label="Messages · 7 days" value={Number(msgs.n)} icon="chat" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="h-fit">
          <CardHeader
            title="Bot"
            description={token ? "Replace the token to move to another bot; business links update automatically." : "Create a bot with @BotFather (/newbot) and paste its token."}
            action={
              live && !("error" in live) ? (
                <a href={`https://t.me/${live.me.username}`} target="_blank" className="text-[13px] text-muted hover:text-fg">@{live.me.username} ↗</a>
              ) : undefined
            }
          />
          <div className="space-y-4 p-5">
            {live && "error" in live && <p className="rounded-lg bg-bad/10 px-3 py-2 text-[13px] text-bad">Telegram error: {live.error}</p>}
            {live && !("error" in live) && (
              <div className="flex flex-wrap gap-2">
                <Badge tone="ok">Connected as @{live.me.username}</Badge>
                <Badge>{live.me.first_name}</Badge>
              </div>
            )}
            <ActionForm action={saveTelegramBot} className="space-y-3">
              <Field label="Bot token"><Input name="botToken" type="password" autoComplete="off" placeholder={token ? "Paste a new token to replace" : "123456789:AA…"} required /></Field>
              <SubmitButton>{token ? "Replace token" : "Connect bot"}</SubmitButton>
            </ActionForm>
            {token && (
              <ActionForm action={disconnectTelegramBot} className="border-t border-border pt-4">
                <p className="mb-2 text-[13px] text-muted">Disconnecting stops every business&apos;s Telegram link until a bot is connected again.</p>
                <SubmitButton variant="danger" size="sm">Disconnect bot</SubmitButton>
              </ActionForm>
            )}
          </div>
        </Card>

        <Card className="h-fit">
          <CardHeader title="Webhook" description="Where Telegram delivers messages. Must be public https." />
          <div className="space-y-3 p-5 text-[14px]">
            <div>
              <div className="text-[13px] text-muted">Expected</div>
              <code className="mt-1 block break-all rounded-md bg-subtle px-2 py-1 font-mono text-[12px]">{expectedUrl}</code>
              {!appUrl.startsWith("https://") && (
                <p className="mt-1 text-[12px] text-warn">
                  The public URL isn&apos;t https. Set it in <Link href="/admin/settings" className="underline">Settings</Link> before registering.
                </p>
              )}
            </div>
            {live && !("error" in live) && (
              <div className="flex flex-wrap gap-2">
                {live.hook.url === expectedUrl ? <Badge tone="ok">Registered</Badge> : live.hook.url ? <Badge tone="warn">Points elsewhere: {live.hook.url}</Badge> : <Badge tone="warn">Not registered</Badge>}
                {live.hook.pending_update_count > 0 && <Badge tone="warn">{live.hook.pending_update_count} pending updates</Badge>}
                {live.hook.last_error_message && <Badge tone="bad">Last error: {live.hook.last_error_message}</Badge>}
              </div>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              <ActionForm action={registerTelegramWebhookAction}><SubmitButton size="sm" variant="secondary">Register webhook</SubmitButton></ActionForm>
              <ActionForm action={rotateTelegramSecret}><SubmitButton size="sm" variant="ghost">Rotate secret</SubmitButton></ActionForm>
            </div>
          </div>
        </Card>

        <Card className="h-fit">
          <CardHeader title="Bot profile" description="What customers see when they open the bot in Telegram." />
          <div className="p-5">
            {live && !("error" in live) ? (
              <ActionForm action={saveTelegramProfile} className="space-y-3">
                <Field label="Name" hint="max 64"><Input name="name" defaultValue={live.profile.name} maxLength={64} /></Field>
                <Field label="Short description" hint="profile page, max 120"><Input name="shortDescription" defaultValue={live.profile.shortDescription} maxLength={120} /></Field>
                <Field label="Description" hint="shown before /start, max 512"><Textarea name="description" rows={4} defaultValue={live.profile.description} maxLength={512} /></Field>
                <SubmitButton variant="secondary">Update in Telegram</SubmitButton>
              </ActionForm>
            ) : (
              <p className="text-[14px] text-muted">Connect the bot first.</p>
            )}
          </div>
        </Card>

        <Card className="h-fit">
          <CardHeader title="Availability" />
          <div className="p-5"><SettingsForm rows={rows} /></div>
        </Card>
      </div>
    </>
  );
}
