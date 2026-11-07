import { archiveService, saveService } from "@/actions/workspace";
import { ConfirmSubmit, SubmitButton, Toggle } from "@/components/client";
import { Badge, Card, CardHeader, Empty, Field, Input, PageHeader, Textarea } from "@/components/ui";
import { ActionForm } from "@/components/workspace/action-form";
import { listServices, listStaff } from "@/lib/queries";
import { currentTenant, requirePermission } from "@/lib/tenant";
import { formatMoney } from "@/lib/time";

export const metadata = { title: "Services" };

type Svc = Awaited<ReturnType<typeof listServices>>[number];
type St = Awaited<ReturnType<typeof listStaff>>[number];

function ServiceFields({ s, staff }: { s?: Svc; staff: St[] }) {
  return (
    <div className="space-y-3">
      {s && <input type="hidden" name="id" value={s.id} />}
      <Field label="Name"><Input name="name" defaultValue={s?.name} required /></Field>
      <Field label="Description"><Textarea name="description" rows={2} defaultValue={s?.description} /></Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Minutes"><Input name="durationMinutes" type="number" min={5} step={5} defaultValue={s?.durationMinutes ?? 60} required /></Field>
        <Field label="Buffer" hint="min"><Input name="bufferMinutes" type="number" min={0} step={5} defaultValue={s?.bufferMinutes ?? 0} /></Field>
        <Field label="Price"><Input name="price" type="number" min={0} step="0.01" defaultValue={s ? s.priceCents / 100 : ""} required /></Field>
      </div>
      <div>
        <div className="mb-1.5 text-[13px] font-medium">Performed by <span className="font-normal text-faint">(none = anyone)</span></div>
        <div className="flex flex-wrap gap-2">
          {staff.filter((x) => x.active).map((x) => (
            <label key={x.id} className="flex cursor-pointer items-center gap-1.5 rounded-full border border-border px-3 py-1 text-[13px] has-checked:border-fg has-checked:bg-subtle">
              <input type="checkbox" name="staffIds" value={x.id} defaultChecked={s?.staffIds.includes(x.id)} className="accent-current" /> {x.name}
            </label>
          ))}
        </div>
      </div>
      {s && <Toggle name="active" defaultChecked={s.active} label="Bookable" description="Inactive services are hidden from customers and the agent." />}
    </div>
  );
}

export default async function ServicesPage() {
  const t = await currentTenant();
  requirePermission(t, "catalog.manage");
  const [services, staff] = await Promise.all([listServices(t.business.id), listStaff(t.business.id)]);
  return (
    <>
      <PageHeader eyebrow="Business" title="Services" description="What customers can book. Your agent quotes these prices and durations exactly." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="h-fit">
          <CardHeader title="New service" />
          <ActionForm action={saveService} className="p-5" resetOnSuccess>
            <ServiceFields staff={staff} />
            <SubmitButton className="mt-4">Add service</SubmitButton>
          </ActionForm>
        </Card>
        <Card className="lg:col-span-2">
          {services.length === 0 ? (
            <Empty icon="scissors" title="No services yet">Add your first service to open bookings.</Empty>
          ) : (
            <ul className="divide-y divide-border">
              {services.map((s) => (
                <li key={s.id} className="px-5 py-4">
                  <details>
                    <summary className="flex cursor-pointer list-none items-center gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 font-medium">{s.name} {!s.active && <Badge>Inactive</Badge>}</div>
                        <div className="truncate text-[13px] text-muted">{s.description || "No description"}</div>
                      </div>
                      <div className="text-right text-[14px] tabular-nums">
                        <div className="font-semibold">{formatMoney(s.priceCents, t.business.currency)}</div>
                        <div className="text-[12px] text-muted">{s.durationMinutes} min{s.bufferMinutes ? ` + ${s.bufferMinutes}` : ""}</div>
                      </div>
                    </summary>
                    <ActionForm action={saveService} className="mt-4 rounded-lg bg-subtle/50 p-4">
                      <ServiceFields s={s} staff={staff} />
                      <SubmitButton size="sm" className="mt-4">Save</SubmitButton>
                    </ActionForm>
                    {s.active && (
                      <form action={archiveService} className="mt-2">
                        <input type="hidden" name="id" value={s.id} />
                        <ConfirmSubmit message="Archive this service? Existing bookings are kept." variant="ghost">Archive</ConfirmSubmit>
                      </form>
                    )}
                  </details>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
