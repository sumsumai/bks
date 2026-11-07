import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";
import { BusinessCard } from "@/components/public/business-card";
import { Button, Card, LinkButton } from "@/components/ui";
import { formatPlanPrice, listPlans } from "@/lib/plans";
import { CATEGORIES, searchBusinesses } from "@/lib/businesses";

export default async function Home() {
  const [featured, plans] = await Promise.all([searchBusinesses({ limit: 6 }), listPlans({ publicOnly: true })]);
  return (
    <main>
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 opacity-70" style={{ background: "radial-gradient(50% 60% at 80% 0%, color-mix(in oklab, var(--ai) 18%, transparent), transparent 70%), radial-gradient(40% 50% at 0% 30%, color-mix(in oklab, #0ea5e9 12%, transparent), transparent 70%)" }} />
        <div className="relative mx-auto max-w-6xl px-4 pt-20 pb-16 sm:px-6 sm:pt-28">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-[13px] text-muted shadow-card">
            <span className="size-1.5 animate-pulse-dot rounded-full bg-ok" /> Every business here answers instantly, day and night
          </div>
          <h1 className="mt-6 max-w-3xl font-display text-[52px] leading-[1.02] tracking-tight sm:text-[76px]">Book great local services. <span className="text-muted">Just ask.</span></h1>
          <p className="mt-5 max-w-xl text-[17px] text-muted">Hair, wellness, fitness, care and more. Pick a time in seconds, or message the business&apos;s AI assistant on WhatsApp or Telegram and it books for you.</p>
          <form action="/discover" className="mt-8 flex max-w-2xl flex-col gap-2 rounded-2xl border border-border bg-surface p-2 shadow-pop sm:flex-row">
            <label className="flex flex-1 items-center gap-2 px-3"><Icon name="search" className="text-faint" /><input name="q" placeholder="Haircut, massage, personal trainer…" className="h-11 w-full bg-transparent outline-none" /></label>
            <label className="flex items-center gap-2 border-border px-3 sm:border-l"><Icon name="mapPin" className="text-faint" /><input name="city" placeholder="City" className="h-11 w-full bg-transparent outline-none sm:w-36" /></label>
            <Button size="lg">Search</Button>
          </form>
          <div className="mt-6 flex flex-wrap gap-2">
            {CATEGORIES.slice(0, 8).map((c) => (
              <Link key={c.id} href={`/discover?category=${c.id}`} className="rounded-full border border-border bg-surface px-3.5 py-1.5 text-[13px] text-muted hover:border-fg/30 hover:text-fg">{c.label}</Link>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-5 flex items-end justify-between">
          <h2 className="text-[22px] font-semibold tracking-tight">Featured</h2>
          <Link href="/discover" className="flex items-center gap-1 text-[14px] text-muted hover:text-fg">Explore all <Icon name="arrowRight" size={15} /></Link>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map(({ business: b, fromPrice, serviceCount, featured }) => (
            <BusinessCard key={b.id} b={{ slug: b.slug, name: b.name, tagline: b.tagline, city: b.city, category: b.category, brandColor: b.brandColor, coverUrl: b.coverUrl, vip: Boolean(featured), currency: b.currency, fromPriceCents: fromPrice, serviceCount }} />
          ))}
        </div>
      </section>

      <section id="business" className="mx-auto mt-28 max-w-6xl px-4 sm:px-6">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <div className="text-[13px] font-medium uppercase tracking-wider text-ai">For service businesses</div>
            <h2 className="mt-3 font-display text-[44px] leading-[1.05]">Not just a booking page. Your own AI front desk.</h2>
            <p className="mt-4 text-[16px] text-muted">The moment you sign up we provision a dedicated NanoClaw assistant for your business. It learns your services, prices, policies and tone, answers on WhatsApp and Telegram, books into your real calendar, and hands over to you when it should.</p>
            <ul className="mt-6 space-y-3 text-[15px]">
              {([
                ["sparkles", "Isolated agent per business, with its own knowledge and memory"],
                ["shield", "You decide what it can do alone and what needs your approval"],
                ["calendar", "Real-time availability with double-booking prevention"],
                ["bell", "Owner app for iOS and Android: approve, reply, track revenue"],
              ] as [IconName, string][]).map(([icon, text]) => (
                <li key={text} className="flex gap-3"><Icon name={icon} className="mt-0.5 shrink-0 text-ai" /> {text}</li>
              ))}
            </ul>
            <LinkButton href="/signup" size="lg" className="mt-8" icon="arrowRight">Start free for 14 days</LinkButton>
          </div>
          <Card className="overflow-hidden">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-[13px]"><Icon name="whatsapp" style={{ color: "#16a34a" }} /> <span className="font-medium">Atelier Nord</span> <span className="text-muted">· AI assistant</span></div>
            <div className="space-y-2.5 bg-subtle/50 p-5 text-[14px]">
              <Bubble side="l">Hi! Anything Saturday morning for a cut?</Bubble>
              <Bubble side="r" ai>Bonjour! Saturday I have 10:00 or 11:30 with Sami. Which suits you?</Bubble>
              <Bubble side="l">10 please, it&apos;s Léa</Bubble>
              <div className="flex justify-end"><span className="rounded-lg border border-dashed border-border bg-surface px-2.5 py-1 text-[12px] text-muted">✦ create_booking · Signature cut, Sat 10:00</span></div>
              <Bubble side="r" ai>Done, Léa: Saturday 10:00 with Sami. Here&apos;s your link to manage it. — Atelier Nord</Bubble>
            </div>
          </Card>
        </div>
      </section>

      <section id="pricing" className="mx-auto mt-28 max-w-4xl px-4 sm:px-6">
        <h2 className="text-center font-display text-[40px]">Simple pricing</h2>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((p) => (
            <Card key={p.id} className={p.highlighted ? "p-7 ring-2 ring-ai/40" : "p-7"}>
              <div className="flex items-center gap-2 font-semibold">{p.name} {p.highlighted && <Icon name="crown" className="text-ai" size={16} />}</div>
              <div className="mt-3 text-[40px] font-semibold tracking-tight">{formatPlanPrice(p).amount}<span className="text-[15px] font-normal text-muted">/{formatPlanPrice(p).per}</span></div>
              <ul className="mt-5 space-y-2 text-[14px]">{p.features.map((f) => <li key={f} className="flex gap-2"><Icon name="check" size={16} className="mt-0.5 text-ok" />{f}</li>)}</ul>
              <LinkButton href="/signup" variant={p.highlighted ? "ai" : "secondary"} className="mt-6 w-full">{p.trialDays ? `Start ${p.trialDays}-day trial` : "Get started"}</LinkButton>
            </Card>
          ))}
        </div>
      </section>
    </main>
  );
}

function Bubble({ side, ai, children }: { side: "l" | "r"; ai?: boolean; children: React.ReactNode }) {
  return (
    <div className={side === "l" ? "flex justify-start" : "flex justify-end"}>
      <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 ${side === "l" ? "rounded-bl-md bg-surface shadow-card" : ai ? "rounded-br-md bg-ai/10 ring-1 ring-ai/20" : ""}`}>{children}</div>
    </div>
  );
}
