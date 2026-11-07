import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { whatsappSessionAction } from "@/actions/admin-platform";
import { Table, Td, fmtDate } from "@/components/admin/table";
import { SettingsForm } from "@/components/admin/settings-form";
import { ConfirmSubmit, SubmitButton } from "@/components/client";
import { Badge, Card, CardHeader, Empty, PageHeader, Stat } from "@/components/ui";
import { db, schema } from "@/db";
import { requirePlatform } from "@/lib/auth";
import { gatewayConfigured, waHealth } from "@/lib/channels/whatsapp";
import { describeSettings } from "@/lib/settings";

export const metadata = { title: "WhatsApp" };

export default async function AdminWhatsApp() {
  await requirePlatform("channels.manage");
  const [rows, settings, health] = await Promise.all([
    db
      .select({ channel: schema.channels, business: { id: schema.businesses.id, name: schema.businesses.name } })
      .from(schema.channels)
      .innerJoin(schema.businesses, eq(schema.businesses.id, schema.channels.businessId))
      .where(and(eq(schema.channels.kind, "whatsapp")))
      .orderBy(desc(schema.channels.createdAt)),
    describeSettings(),
    gatewayConfigured() ? waHealth().catch((e) => ({ error: String(e?.message ?? e) })) : Promise.resolve(null),
  ]);
  const sessions = health && !("error" in health) ? new Map(health.sessions.map((s) => [s.businessId, s])) : new Map();
  const linked = rows.filter((r) => r.channel.status === "connected").length;

  return (
    <>
      <PageHeader eyebrow="Channels" title="WhatsApp" description="Each business links its own WhatsApp Business app as a linked device. Sessions run in the WhatsApp gateway (one instance)." />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Linked numbers" value={linked} icon="whatsapp" />
        <Stat label="Live sessions in gateway" value={health && !("error" in health) ? health.sessions.filter((s) => s.status === "open").length : "—"} icon="bolt" />
        <Stat label="Gateway" value={!health ? "Not configured" : "error" in health ? "Unreachable" : "Online"} icon="plug" />
      </div>
      {health && "error" in health && <p className="mb-6 rounded-card bg-bad/10 px-4 py-3 text-[14px] text-bad">Gateway unreachable: {health.error}. Check that apps/wa-gateway is running and WA_GATEWAY_URL / WA_GATEWAY_SECRET match.</p>}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Business numbers" />
          {rows.length === 0 ? (
            <Empty icon="whatsapp" title="No business has linked WhatsApp yet" />
          ) : (
            <Table head={["Business", "Number", "Status", "Gateway", "Updated", ""]}>
              {rows.map(({ channel: c, business: b }) => {
                const gw = sessions.get(b.id);
                return (
                  <tr key={c.id} className="hover:bg-subtle/50">
                    <Td><Link href={`/admin/businesses/${b.id}`} className="font-medium hover:underline">{b.name}</Link></Td>
                    <Td className="text-muted">{c.displayName || "—"}</Td>
                    <Td>
                      <Badge tone={c.status === "connected" ? "ok" : c.status === "pairing" ? "warn" : c.status === "error" ? "bad" : "neutral"}>{c.status}</Badge>
                      {c.lastError && <div className="mt-1 max-w-56 truncate text-[12px] text-bad" title={c.lastError}>{c.lastError}</div>}
                    </Td>
                    <Td>{gw ? <Badge tone={gw.status === "open" ? "ok" : "warn"}>{gw.status}</Badge> : <span className="text-faint">—</span>}</Td>
                    <Td className="whitespace-nowrap text-muted">{fmtDate(c.createdAt)}</Td>
                    <Td>
                      {(c.status === "connected" || c.status === "pairing") && (
                        <div className="flex justify-end gap-1">
                          <form action={whatsappSessionAction}>
                            <input type="hidden" name="businessId" value={b.id} />
                            <input type="hidden" name="action" value="restart" />
                            <SubmitButton size="sm" variant="ghost">Restart</SubmitButton>
                          </form>
                          <form action={whatsappSessionAction}>
                            <input type="hidden" name="businessId" value={b.id} />
                            <input type="hidden" name="action" value="unlink" />
                            <ConfirmSubmit variant="ghost" message={`Unlink ${b.name}'s WhatsApp? Their assistant stops answering there until they link again.`}>Unlink</ConfirmSubmit>
                          </form>
                        </div>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </Table>
          )}
        </Card>
        <Card className="h-fit">
          <CardHeader title="Settings" />
          <div className="p-5">
            <SettingsForm rows={settings.filter((r) => r.group === "whatsapp" || r.key === "reminders.whatsapp")} />
          </div>
        </Card>
      </div>
    </>
  );
}
