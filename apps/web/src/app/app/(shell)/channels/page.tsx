import { eq } from "drizzle-orm";
import { disconnectChannelAction, enableTelegramAction } from "@/actions/workspace";
import { ConfirmSubmit, SubmitButton } from "@/components/client";
import { Icon } from "@/components/icons";
import { Badge, Card, ChannelIcon, LinkButton, PageHeader } from "@/components/ui";
import { ActionForm } from "@/components/workspace/action-form";
import { CopyButton } from "@/components/workspace/copy-button";
import { WhatsAppLink } from "@/components/workspace/whatsapp-link";
import { db, schema } from "@/db";
import { telegramAvailable } from "@/lib/channels/telegram";
import { whatsappAvailable } from "@/lib/channels/whatsapp";
import { entitlementsOf } from "@/lib/plans";
import { currentTenant, requirePermission } from "@/lib/tenant";

export const metadata = { title: "Channels" };

export default async function ChannelsPage() {
  const t = await currentTenant();
  requirePermission(t, "agent.manage");
  const rows = await db.select().from(schema.channels).where(eq(schema.channels.businessId, t.business.id));
  const tg = rows.find((c) => c.kind === "telegram");
  const wa = rows.find((c) => c.kind === "whatsapp");
  const tgOn = tg?.status === "connected";
  const waOn = wa?.status === "connected";
  const ent = await entitlementsOf(t.business);
  const tgAvailable = ent.telegram && (await telegramAvailable());
  const waAvailable = ent.whatsapp && (await whatsappAvailable());

  return (
    <>
      <PageHeader eyebrow="NanoClaw agent" title="Channels" description="Where customers reach your agent. One agent, one memory, every channel. Conversations from all channels land in your inbox." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <Head channel="whatsapp" title="WhatsApp Business" on={waOn} pairing={wa?.status === "pairing"} detail={waOn ? wa?.displayName : "Link the WhatsApp Business app you already use"} />
          {waOn ? (
            <>
              <p className="mt-3 text-[14px] text-muted">
                Your assistant answers customers on your own number. Keep using WhatsApp Business on your phone as usual: when you reply yourself, your message shows up in the inbox and the assistant steps back for that customer until you hand it back (or after 12 quiet hours).
              </p>
              {wa?.publicHandle && (
                <div className="mt-4 flex items-center gap-2 rounded-lg bg-subtle px-3 py-2 text-[13px]">
                  <code className="flex-1 truncate">https://wa.me/{wa.publicHandle}</code>
                  <CopyButton value={`https://wa.me/${wa.publicHandle}`} />
                </div>
              )}
              <form action={disconnectChannelAction} className="mt-5">
                <input type="hidden" name="kind" value="whatsapp" />
                <ConfirmSubmit message="Unlink WhatsApp? Your assistant stops answering; WhatsApp keeps working on your phone.">Unlink</ConfirmSubmit>
              </form>
            </>
          ) : waAvailable ? (
            <>
              <p className="mt-3 mb-4 text-[14px] text-muted">Your assistant joins your WhatsApp Business as a linked device, like WhatsApp Web. Your number, contacts and recent chats stay exactly as they are.</p>
              <WhatsAppLink initial={wa ? { status: wa.status, pairing: wa.status === "pairing" ? wa.pairing : null, displayName: wa.displayName, lastError: wa.lastError } : null} />
            </>
          ) : (
            <p className="mt-4 rounded-lg bg-subtle px-3 py-2 text-[13px] text-muted">WhatsApp isn&apos;t set up on this platform yet.</p>
          )}
        </Card>

        <Card className="p-6">
          <Head channel="telegram" title="Telegram" on={tgOn} detail={tgOn ? `via ${tg?.displayName}` : "Through our Telegram assistant"} />
          <p className="mt-3 text-[14px] text-muted">
            Every business on the platform shares one Telegram assistant. Your personal link opens it directly on <span className="font-medium text-fg">{t.business.name}</span>, with your agent, your knowledge and your bookings. Customers can switch between businesses with /switch.
          </p>
          {tgOn && tg?.publicHandle ? (
            <>
              <div className="mt-4 flex items-center gap-2 rounded-lg bg-subtle px-3 py-2 text-[13px]">
                <code className="flex-1 truncate">{tg.publicHandle}</code>
                <CopyButton value={tg.publicHandle} />
              </div>
              <p className="mt-2 text-[12px] text-faint">Shown on your booking page. Add it to your Instagram bio, website and receipts.</p>
              {tg.lastError && <p className="mt-3 rounded-lg bg-warn/10 px-3 py-2 text-[13px] text-warn">{tg.lastError}</p>}
              <div className="mt-5 flex gap-2">
                <LinkButton href={tg.publicHandle} target="_blank" variant="secondary" icon="external">Try it</LinkButton>
                <form action={disconnectChannelAction}>
                  <input type="hidden" name="kind" value="telegram" />
                  <ConfirmSubmit message="Turn off Telegram? Your link will stop working." size="md">Turn off</ConfirmSubmit>
                </form>
              </div>
            </>
          ) : tgAvailable ? (
            <ActionForm action={enableTelegramAction} className="mt-5">
              <SubmitButton icon="telegram">Turn on Telegram</SubmitButton>
            </ActionForm>
          ) : (
            <p className="mt-5 rounded-lg bg-subtle px-3 py-2 text-[13px] text-muted">The platform Telegram assistant isn&apos;t configured yet.</p>
          )}
        </Card>

        <Card className="p-6 lg:col-span-2">
          <Head channel="web" title="Booking page chat" on detail="Always on" />
          <p className="mt-3 text-[14px] text-muted">Visitors to your booking page can chat with your agent directly. Your WhatsApp and Telegram buttons appear there too once connected.</p>
          <LinkButton href={`/b/${t.business.slug}`} target="_blank" variant="secondary" className="mt-4" icon="external">Open booking page</LinkButton>
        </Card>
      </div>
    </>
  );
}

function Head({ channel, title, on, detail, pairing }: { channel: "whatsapp" | "telegram" | "web"; title: string; on?: boolean; detail?: string | null; pairing?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="grid size-10 place-items-center rounded-xl bg-subtle"><ChannelIcon channel={channel} size={20} /></div>
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{title}</div>
        {detail && <div className="truncate text-[13px] text-muted">{detail}</div>}
      </div>
      {on ? <Badge tone="ok" icon="check">Live</Badge> : channel === "whatsapp" && pairing ? <Badge tone="warn">Linking…</Badge> : <Badge><Icon name="plug" size={12} /> Off</Badge>}
    </div>
  );
}
