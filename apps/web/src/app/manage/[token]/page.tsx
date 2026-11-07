import Link from "next/link";
import { notFound } from "next/navigation";
import { ManageBooking } from "@/components/public/manage-booking";
import { Badge, BOOKING_LABEL, BOOKING_TONE, Card, Logo } from "@/components/ui";
import { bookingByToken } from "@/lib/bookings";
import { formatMoney, todayIn } from "@/lib/time";

export const metadata = { title: "Your booking", robots: { index: false } };

export default async function ManagePage({ params }: { params: Promise<{ token: string }> }) {
  const row = await bookingByToken((await params).token);
  if (!row) notFound();
  const { booking: b, business, service, staff } = row;
  const tz = business.timezone;
  const live = b.status === "pending" || b.status === "confirmed";
  const hoursLeft = (b.startsAt.getTime() - Date.now()) / 3600_000;
  const canChange = live && hoursLeft >= business.policy.cancellationWindowHours;
  return (
    <main className="mx-auto max-w-lg px-4 py-12">
      <Link href="/"><Logo /></Link>
      <Card className="mt-8 overflow-hidden">
        <div className="h-2" style={{ background: business.brandColor }} />
        <div className="p-6">
          <div className="flex items-center justify-between">
            <Link href={`/b/${business.slug}`} className="font-semibold hover:underline">{business.name}</Link>
            <Badge tone={BOOKING_TONE[b.status]}>{BOOKING_LABEL[b.status]}</Badge>
          </div>
          <h1 className="mt-4 text-[24px] font-semibold tracking-tight">{service.name}</h1>
          <p className="mt-1 text-muted">
            {new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(b.startsAt)}
            <br />with {staff.name} · {formatMoney(b.priceCents, business.currency)}
          </p>
          {live && !canChange && <p className="mt-6 rounded-lg bg-subtle px-3 py-2 text-[13px] text-muted">Changes are possible up to {business.policy.cancellationWindowHours}h before. Please contact {business.name}{business.phone ? ` at ${business.phone}` : ""}.</p>}
          <ManageBooking token={b.manageToken} slug={business.slug} serviceId={service.id} timezone={tz} today={todayIn(tz)} canChange={canChange} brand={business.brandColor} />
        </div>
      </Card>
    </main>
  );
}
