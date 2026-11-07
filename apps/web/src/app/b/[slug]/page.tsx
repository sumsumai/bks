import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/icons";
import { BookingFlow } from "@/components/public/booking-flow";
import { ChatWidget } from "@/components/public/chat-widget";
import { Avatar, Badge, Card, Logo } from "@/components/ui";
import { getAgent } from "@/lib/agent/runtime";
import { currentUser } from "@/lib/auth";
import { publicBusiness, publicProfile } from "@/lib/public";
import { membershipsOf } from "@/lib/tenant";
import { todayIn } from "@/lib/time";
import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ service?: string }> };

async function load(slug: string) {
  // Team members can preview an unpublished page.
  try {
    return await publicBusiness(slug);
  } catch {
    const user = await currentUser();
    if (!user) return null;
    const ms = await membershipsOf(user.id);
    const m = ms.find((x) => x.business.slug === slug);
    return m?.business ?? null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const b = await load((await params).slug);
  return b ? { title: `${b.name}: book online`, description: b.tagline || b.description.slice(0, 150) } : {};
}

export default async function BusinessPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { service } = await searchParams;
  const business = await load(slug);
  if (!business) notFound();
  const [{ business: b, services, staff, locations }, agent, channels] = await Promise.all([
    publicProfile(business),
    getAgent(business.id),
    db.select().from(schema.channels).where(and(eq(schema.channels.businessId, business.id), eq(schema.channels.status, "connected"))),
  ]);
  const wa = channels.find((c) => c.kind === "whatsapp" && c.publicHandle);
  const tg = channels.find((c) => c.kind === "telegram" && c.publicHandle);

  return (
    <div className="min-h-dvh" style={{ ["--brand" as string]: b.brandColor }}>
      {!business.published && <div className="bg-warn px-4 py-1.5 text-center text-[13px] font-medium text-white">Preview: this page is not published yet</div>}
      <div className="relative h-56 sm:h-72" style={{ background: b.brandColor }}>
        {b.coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={b.coverUrl} alt="" className="size-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
        <div className="absolute top-4 left-4"><Link href="/" className="rounded-full bg-black/40 px-3 py-1.5 text-[12px] font-medium text-white backdrop-blur">← BKS</Link></div>
      </div>
      <div className="mx-auto -mt-16 max-w-5xl px-4 pb-24 sm:px-6">
        <div className="relative grid gap-6 lg:grid-cols-[1fr_340px]">
          <Card className="p-6 sm:p-8">
            <div className="flex items-start gap-4">
              <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-2xl text-[24px] font-semibold text-white shadow-card" style={{ background: b.brandColor }}>
                {b.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={b.logoUrl} alt="" className="size-full object-cover" />
                ) : b.name[0]}
              </span>
              <div className="min-w-0">
                <h1 className="flex flex-wrap items-center gap-2 text-[26px] font-semibold tracking-tight">{b.name} {b.vip && <Badge tone="ai" icon="crown">VIP</Badge>}</h1>
                {b.tagline && <p className="text-muted">{b.tagline}</p>}
              </div>
            </div>
            <div className="mt-8"><BookingFlow slug={b.slug} services={services} staff={staff} currency={b.currency} timezone={b.timezone} today={todayIn(b.timezone)} brand={b.brandColor} autoConfirm={b.policy.autoConfirm} initialServiceId={service} /></div>
          </Card>

          <aside className="space-y-4">
            <Card className="p-5 text-[14px]">
              {b.description && <p className="text-muted">{b.description}</p>}
              <ul className="mt-4 space-y-2">
                {(locations[0]?.address || b.city) && <li className="flex gap-2"><Icon name="mapPin" size={16} className="mt-0.5 text-faint" /> {locations[0]?.address || b.city}</li>}
                {b.phone && <li className="flex gap-2"><Icon name="chat" size={16} className="mt-0.5 text-faint" /> {b.phone}</li>}
                {b.website && <li className="flex gap-2"><Icon name="globe" size={16} className="mt-0.5 text-faint" /> <a href={b.website} className="underline" target="_blank" rel="noreferrer">{b.website.replace(/^https?:\/\//, "")}</a></li>}
              </ul>
            </Card>
            {(wa || tg) && agent?.status === "active" && (
              <Card className="p-5">
                <div className="mb-1 text-[13px] font-semibold uppercase tracking-wider text-faint">Message us</div>
                <p className="mb-3 text-[13px] text-muted">Our assistant answers instantly and can book for you.</p>
                <div className="flex flex-col gap-2">
                  {wa && <a href={`https://wa.me/${wa.publicHandle}`} target="_blank" rel="noreferrer" className="flex h-10 items-center justify-center gap-2 rounded-[10px] bg-[#16a34a] text-[14px] font-medium text-white hover:opacity-90"><Icon name="whatsapp" size={17} /> WhatsApp</a>}
                  {tg && <a href={tg.publicHandle!} target="_blank" rel="noreferrer" className="flex h-10 items-center justify-center gap-2 rounded-[10px] bg-[#0284c7] text-[14px] font-medium text-white hover:opacity-90"><Icon name="telegram" size={17} /> Telegram</a>}
                </div>
              </Card>
            )}
            {staff.length > 0 && (
              <Card className="p-5">
                <div className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-faint">Team</div>
                <ul className="space-y-3">
                  {staff.map((s) => (
                    <li key={s.id} className="flex gap-3">
                      <Avatar name={s.name} color={s.color} size={36} />
                      <div><div className="text-[14px] font-medium">{s.name}</div><div className="text-[13px] text-muted">{s.title}</div></div>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
            <Card className="p-5 text-[13px] text-muted">
              <div className="mb-1 font-semibold text-fg">Booking policy</div>
              Free cancellation up to {b.policy.cancellationWindowHours}h before. {b.policy.policyText}
            </Card>
            <div className="flex justify-center pt-2 opacity-60"><Link href="/"><Logo className="scale-90" /></Link></div>
          </aside>
        </div>
      </div>
      {agent?.status === "active" && <ChatWidget slug={b.slug} businessName={b.name} agentName={agent.name} brand={b.brandColor} />}
    </div>
  );
}
