"use client";

import { useEffect, useState } from "react";
import { Button, cx, Input } from "../ui";

type Props = { token: string; slug: string; serviceId: string; timezone: string; today: string; canChange: boolean; brand: string };

export function ManageBooking({ token, slug, serviceId, timezone, today, canChange, brand }: Props) {
  const [mode, setMode] = useState<"idle" | "reschedule" | "cancel" | "done">("idle");
  const [date, setDate] = useState(today);
  const [slots, setSlots] = useState<{ startsAt: string; time: string }[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (mode !== "reschedule") return;
    setSlots(null);
    fetch(`/api/v1/public/businesses/${slug}/slots?serviceId=${serviceId}&date=${date}`).then((r) => r.json()).then((j) => setSlots(j.slots ?? [])).catch(() => setSlots([]));
  }, [mode, date, slug, serviceId]);

  async function post(body: object, done: string) {
    setBusy(true);
    setMsg(null);
    const r = await fetch(`/api/v1/public/manage/${token}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return setMsg(j.detail ?? "Something went wrong");
    setMode("done");
    setMsg(done);
    setTimeout(() => location.reload(), 1200);
  }

  if (!canChange) return null;
  if (mode === "done") return <p className="mt-6 rounded-lg bg-ok/10 px-3 py-2 text-[14px] text-ok">{msg}</p>;

  return (
    <div className="mt-6 space-y-4">
      {mode === "idle" && (
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setMode("reschedule")}>Reschedule</Button>
          <Button variant="danger" onClick={() => setMode("cancel")}>Cancel booking</Button>
        </div>
      )}
      {mode === "reschedule" && (
        <div className="space-y-3">
          <Input type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} />
          <div className="grid grid-cols-4 gap-2">
            {slots === null ? <span className="col-span-4 text-[13px] text-muted">Loading…</span> : slots.length === 0 ? <span className="col-span-4 text-[13px] text-muted">No openings that day.</span> : slots.map((s) => (
              <button key={s.startsAt} disabled={busy} onClick={() => post({ action: "reschedule", startsAt: s.startsAt }, `Moved to ${new Intl.DateTimeFormat("en-GB", { timeZone: timezone, weekday: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(s.startsAt))}`)} className={cx("h-10 rounded-lg border border-border text-[14px] font-medium hover:text-white")} onMouseEnter={(e) => (e.currentTarget.style.background = brand)} onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                {s.time}
              </button>
            ))}
          </div>
          <Button variant="ghost" size="sm" onClick={() => setMode("idle")}>Back</Button>
        </div>
      )}
      {mode === "cancel" && (
        <form onSubmit={(e) => { e.preventDefault(); post({ action: "cancel", reason: new FormData(e.currentTarget).get("reason") ?? "" }, "Your booking is cancelled."); }} className="space-y-3">
          <Input name="reason" placeholder="Reason (optional)" />
          <div className="flex gap-2">
            <Button variant="danger" disabled={busy}>Confirm cancellation</Button>
            <Button type="button" variant="ghost" onClick={() => setMode("idle")}>Keep booking</Button>
          </div>
        </form>
      )}
      {msg && <p className="rounded-lg bg-bad/10 px-3 py-2 text-[13px] text-bad">{msg}</p>}
    </div>
  );
}
