import { and, eq, gt } from "drizzle-orm";
import { addTimeOff, deleteTimeOff, saveStaff } from "@/actions/workspace";
import { ConfirmSubmit, SubmitButton, Toggle } from "@/components/client";
import { Avatar, Badge, Card, CardHeader, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { ActionForm } from "@/components/workspace/action-form";
import { db, schema } from "@/db";
import { listStaff } from "@/lib/queries";
import { currentTenant, requirePermission } from "@/lib/tenant";
import { formatDate, minutesToHHMM, todayIn } from "@/lib/time";

export const metadata = { title: "Team & hours" };

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ORDER = [1, 2, 3, 4, 5, 6, 0];
type St = Awaited<ReturnType<typeof listStaff>>[number];

function HoursEditor({ s }: { s?: St }) {
  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-[64px_1fr_1fr_1fr_1fr] gap-2 text-[11px] font-medium uppercase tracking-wider text-faint">
        <span>Day</span><span>Open</span><span>Close</span><span>Break from</span><span>to</span>
      </div>
      {ORDER.map((d) => {
        const ranges = (s?.hours ?? []).filter((h) => h.weekday === d).sort((a, b) => a.startMinute - b.startMinute);
        const open = s ? ranges.length > 0 : d >= 1 && d <= 5;
        const start = ranges[0]?.startMinute ?? 540;
        const end = ranges[ranges.length - 1]?.endMinute ?? 1080;
        const brk = ranges.length > 1 ? [ranges[0].endMinute, ranges[1].startMinute] : null;
        return (
          <div key={d} className="grid grid-cols-[64px_1fr_1fr_1fr_1fr] items-center gap-2">
            <label className="flex items-center gap-1.5 text-[13px]"><input type="checkbox" name={`day${d}`} defaultChecked={open} /> {DAYS[d]}</label>
            <Input type="time" name={`start${d}`} defaultValue={minutesToHHMM(start)} className="h-8 px-2 text-[13px]" />
            <Input type="time" name={`end${d}`} defaultValue={minutesToHHMM(end)} className="h-8 px-2 text-[13px]" />
            <Input type="time" name={`breakStart${d}`} defaultValue={brk ? minutesToHHMM(brk[0]) : ""} className="h-8 px-2 text-[13px]" />
            <Input type="time" name={`breakEnd${d}`} defaultValue={brk ? minutesToHHMM(brk[1]) : ""} className="h-8 px-2 text-[13px]" />
          </div>
        );
      })}
    </div>
  );
}

function StaffFields({ s }: { s?: St }) {
  return (
    <div className="space-y-3">
      {s && <input type="hidden" name="id" value={s.id} />}
      <div className="grid grid-cols-[1fr_1fr_64px] gap-3">
        <Field label="Name"><Input name="name" defaultValue={s?.name} required /></Field>
        <Field label="Title"><Input name="title" defaultValue={s?.title} /></Field>
        <Field label="Color"><Input type="color" name="color" defaultValue={s?.color ?? "#6366f1"} className="p-1" /></Field>
      </div>
      <Field label="Bio" hint="shown on your page and to the agent"><Textarea name="bio" rows={2} defaultValue={s?.bio} /></Field>
      <HoursEditor s={s} />
      {s && <Toggle name="active" defaultChecked={s.active} label="Taking bookings" />}
    </div>
  );
}

export default async function TeamPage() {
  const t = await currentTenant();
  requirePermission(t, "catalog.manage");
  const staff = await listStaff(t.business.id);
  const off = await db.select().from(schema.timeOff).where(and(eq(schema.timeOff.businessId, t.business.id), gt(schema.timeOff.endsAt, new Date()))).orderBy(schema.timeOff.startsAt);
  const tz = t.business.timezone;
  return (
    <>
      <PageHeader eyebrow="Business" title="Team & hours" description={`Working hours drive availability everywhere: booking page, agent and owner app. Times are in ${tz}.`} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {staff.map((s) => (
            <Card key={s.id}>
              <details>
                <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4">
                  <Avatar name={s.name} color={s.color} size={38} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 font-medium">{s.name} {!s.active && <Badge>Inactive</Badge>}</div>
                    <div className="text-[13px] text-muted">{s.title || "Team member"}</div>
                  </div>
                  <div className="hidden gap-1 sm:flex">
                    {ORDER.map((d) => (
                      <span key={d} className={`grid size-7 place-items-center rounded-md text-[11px] ${s.hours.some((h) => h.weekday === d) ? "bg-accent text-accent-fg" : "bg-subtle text-faint"}`}>{DAYS[d][0]}</span>
                    ))}
                  </div>
                </summary>
                <ActionForm action={saveStaff} className="border-t border-border p-5">
                  <StaffFields s={s} />
                  <SubmitButton size="sm" className="mt-4">Save</SubmitButton>
                </ActionForm>
              </details>
            </Card>
          ))}
          <Card>
            <CardHeader title="Add team member" />
            <ActionForm action={saveStaff} className="p-5" resetOnSuccess>
              <StaffFields />
              <SubmitButton className="mt-4">Add</SubmitButton>
            </ActionForm>
          </Card>
        </div>
        <Card className="h-fit">
          <CardHeader title="Time off & closures" />
          <ActionForm action={addTimeOff} className="space-y-3 p-5" resetOnSuccess>
            <Field label="Who">
              <Select name="staffId" defaultValue=""><option value="">Whole business (closed)</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="From"><Input type="date" name="from" defaultValue={todayIn(tz)} required /></Field>
              <Field label="To" hint="inclusive"><Input type="date" name="to" defaultValue={todayIn(tz)} required /></Field>
            </div>
            <Field label="Reason"><Input name="reason" placeholder="Holiday, training…" /></Field>
            <SubmitButton variant="secondary">Add</SubmitButton>
          </ActionForm>
          <ul className="divide-y divide-border border-t border-border">
            {off.map((o) => (
              <li key={o.id} className="flex items-center gap-2 px-5 py-3 text-[13px]">
                <div className="flex-1">
                  <div className="font-medium">{o.staffId ? staff.find((s) => s.id === o.staffId)?.name : "Business closed"}</div>
                  <div className="text-muted">{formatDate(o.startsAt, tz)} → {formatDate(new Date(o.endsAt.getTime() - 1), tz)}{o.reason ? ` · ${o.reason}` : ""}</div>
                </div>
                <form action={deleteTimeOff}><input type="hidden" name="id" value={o.id} /><ConfirmSubmit message="Remove this time off?" variant="ghost" icon="trash">{""}</ConfirmSubmit></form>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
