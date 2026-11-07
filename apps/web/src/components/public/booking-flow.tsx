"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "../icons";
import { Avatar, Button, cx, Field, Input, Textarea } from "../ui";

type Service = { id: string; name: string; description: string; durationMinutes: number; priceCents: number; staffIds: string[] };
type Staff = { id: string; name: string; title: string; color: string };
type Slot = { startsAt: string; time: string; staffIds: string[] };

const addDays = (d: string, n: number) => {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day + n)).toISOString().slice(0, 10);
};

export function BookingFlow({ slug, services, staff, currency, timezone, today, brand, autoConfirm, initialServiceId }: { slug: string; services: Service[]; staff: Staff[]; currency: string; timezone: string; today: string; brand: string; autoConfirm: boolean; initialServiceId?: string }) {
  const [serviceId, setServiceId] = useState<string | null>(initialServiceId ?? null);
  const [staffId, setStaffId] = useState<string>("");
  const [date, setDate] = useState(today);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ manageToken: string; status: string; startsAt: string; service: string; staff: string } | null>(null);

  const service = services.find((s) => s.id === serviceId) ?? null;
  const eligible = useMemo(() => (service ? (service.staffIds.length ? staff.filter((s) => service.staffIds.includes(s.id)) : staff) : []), [service, staff]);
  const money = (c: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: c % 100 ? 2 : 0 }).format(c / 100);
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i));

  useEffect(() => {
    if (!serviceId) return;
    let cancelled = false;
    setSlots(null);
    setSlot(null);
    fetch(`/api/v1/public/businesses/${slug}/slots?${new URLSearchParams({ serviceId, date, ...(staffId ? { staffId } : {}) })}`)
      .then((r) => r.json())
      .then((j) => !cancelled && setSlots(j.slots ?? []))
      .catch(() => !cancelled && setSlots([]));
    return () => {
      cancelled = true;
    };
  }, [slug, serviceId, staffId, date]);

  async function submit(f: FormData) {
    if (!service || !slot) return;
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/v1/public/businesses/${slug}/bookings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        serviceId: service.id,
        staffId: staffId || slot.staffIds[0],
        startsAt: slot.startsAt,
        name: f.get("name"),
        email: f.get("email"),
        phone: f.get("phone") || undefined,
        notes: f.get("notes") || undefined,
        consent: f.get("consent") === "on",
        marketingConsent: f.get("marketing") === "on",
      }),
    });
    const j = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setError(j.errors ? Object.values(j.errors).flat().join(" ") : j.detail ?? "Booking failed");
      if (j.code === "slot_taken" || j.code === "slot_unavailable") setDate((d) => d); // refresh slots
      return;
    }
    setDone(j.booking);
  }

  const fmtWhen = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: timezone, weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

  if (done) {
    const end = new Date(new Date(done.startsAt).getTime() + (service?.durationMinutes ?? 60) * 60000);
    const ics = `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nDTSTART:${new Date(done.startsAt).toISOString().replace(/[-:]|\.\d{3}/g, "")}\nDTEND:${end.toISOString().replace(/[-:]|\.\d{3}/g, "")}\nSUMMARY:${done.service}\nEND:VEVENT\nEND:VCALENDAR`;
    return (
      <div className="animate-fade-up py-6 text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-full text-white" style={{ background: brand }}><Icon name="check" size={26} /></div>
        <h3 className="mt-4 text-[22px] font-semibold">{done.status === "pending" ? "Request sent" : "You're booked"}</h3>
        <p className="mt-1 text-muted">{done.service} with {done.staff}<br />{fmtWhen(done.startsAt)}</p>
        {done.status === "pending" && <p className="mt-2 text-[14px] text-warn">The team will confirm shortly.</p>}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <a href={`data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`} download="booking.ics" className="rounded-[10px] border border-border px-4 py-2 text-[14px] hover:bg-subtle">Add to calendar</a>
          <a href={`/manage/${done.manageToken}`} className="rounded-[10px] border border-border px-4 py-2 text-[14px] hover:bg-subtle">Manage booking</a>
        </div>
        <p className="mt-4 text-[12px] text-faint">Save the manage link: it lets you reschedule or cancel.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section>
        <StepTitle n={1} title="Choose a service" />
        <div className="space-y-2">
          {services.map((s) => (
            <button key={s.id} onClick={() => { setServiceId(s.id); setStaffId(""); }} className={cx("flex w-full items-start gap-4 rounded-xl border p-4 text-left transition", serviceId === s.id ? "border-fg bg-subtle ring-2 ring-fg/10" : "border-border bg-surface hover:border-fg/30")}>
              <div className="min-w-0 flex-1">
                <div className="font-medium">{s.name}</div>
                {s.description && <div className="mt-0.5 text-[13px] text-muted">{s.description}</div>}
                <div className="mt-1 flex items-center gap-1 text-[12px] text-faint"><Icon name="clock" size={12} /> {s.durationMinutes} min</div>
              </div>
              <div className="font-semibold tabular-nums">{money(s.priceCents)}</div>
            </button>
          ))}
        </div>
      </section>

      {service && (
        <section className="animate-fade-up">
          <StepTitle n={2} title="Pick a time" />
          {eligible.length > 1 && (
            <div className="scrollbar-none mb-4 flex gap-2 overflow-x-auto">
              <button onClick={() => setStaffId("")} className={cx("shrink-0 rounded-full border px-3 py-1.5 text-[13px]", !staffId ? "border-fg bg-fg text-bg" : "border-border")}>Anyone</button>
              {eligible.map((s) => (
                <button key={s.id} onClick={() => setStaffId(s.id)} className={cx("flex shrink-0 items-center gap-1.5 rounded-full border py-1 pr-3 pl-1 text-[13px]", staffId === s.id ? "border-fg bg-fg text-bg" : "border-border")}>
                  <Avatar name={s.name} color={s.color} size={22} /> {s.name}
                </button>
              ))}
            </div>
          )}
          <div className="scrollbar-none -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-2">
            {days.map((d) => {
              const dt = new Date(`${d}T12:00:00Z`);
              return (
                <button key={d} onClick={() => setDate(d)} className={cx("flex w-14 shrink-0 flex-col items-center rounded-xl border py-2 transition", date === d ? "border-transparent text-white" : "border-border bg-surface hover:border-fg/30")} style={date === d ? { background: brand } : undefined}>
                  <span className="text-[11px] uppercase opacity-70">{dt.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" })}</span>
                  <span className="text-[17px] font-semibold">{dt.getUTCDate()}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-3 min-h-24">
            {slots === null ? (
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">{Array.from({ length: 12 }, (_, i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-subtle" />)}</div>
            ) : slots.length === 0 ? (
              <p className="py-6 text-center text-[14px] text-muted">No openings this day. Try another date.</p>
            ) : (
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                {slots.map((s) => (
                  <button key={s.startsAt} onClick={() => setSlot(s)} className={cx("h-10 rounded-lg border text-[14px] font-medium tabular-nums transition", slot?.startsAt === s.startsAt ? "border-transparent text-white" : "border-border bg-surface hover:border-fg/40")} style={slot?.startsAt === s.startsAt ? { background: brand } : undefined}>
                    {s.time}
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {service && slot && (
        <section className="animate-fade-up">
          <StepTitle n={3} title="Your details" />
          <div className="mb-4 rounded-xl bg-subtle p-4 text-[14px]">
            <div className="font-medium">{service.name} · {money(service.priceCents)}</div>
            <div className="text-muted">{fmtWhen(slot.startsAt)}{staffId ? ` with ${staff.find((s) => s.id === staffId)?.name}` : ""}</div>
          </div>
          <form action={submit} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Full name"><Input name="name" required autoComplete="name" /></Field>
              <Field label="Phone" hint="for reminders"><Input name="phone" type="tel" autoComplete="tel" /></Field>
            </div>
            <Field label="Email"><Input name="email" type="email" required autoComplete="email" /></Field>
            <Field label="Notes" hint="optional"><Textarea name="notes" rows={2} /></Field>
            <label className="flex gap-2 text-[13px] text-muted"><input type="checkbox" name="consent" required className="mt-0.5" /> I agree that this business processes my details to manage my booking (see <a href="/privacy" className="underline" target="_blank">privacy notice</a>).</label>
            <label className="flex gap-2 text-[13px] text-muted"><input type="checkbox" name="marketing" className="mt-0.5" /> Send me occasional offers from this business.</label>
            {error && <p className="rounded-lg bg-bad/10 px-3 py-2 text-[13px] text-bad">{error}</p>}
            <Button type="submit" size="lg" className="w-full !text-white" style={{ background: brand }} disabled={submitting}>
              {submitting ? "Booking…" : autoConfirm ? "Confirm booking" : "Request booking"}
            </Button>
          </form>
        </section>
      )}
    </div>
  );
}

function StepTitle({ n, title }: { n: number; title: string }) {
  return (
    <h3 className="mb-3 flex items-center gap-2 text-[15px] font-semibold">
      <span className="grid size-6 place-items-center rounded-full bg-subtle text-[12px] text-muted">{n}</span> {title}
    </h3>
  );
}
