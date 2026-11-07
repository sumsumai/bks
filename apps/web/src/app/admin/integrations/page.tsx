import { Badge, Card, CardHeader, PageHeader } from "@/components/ui";
import { requirePlatform } from "@/lib/auth";
import { telegramConfigured } from "@/lib/channels/telegram";
import { gatewayConfigured, waHealth } from "@/lib/channels/whatsapp";
import { isLiveMode } from "@/lib/agent/runtime";
import { stripeEnabled } from "@/lib/billing";
import { getSettings } from "@/lib/settings";

export const metadata = { title: "System status" };

/** Infrastructure that stays in environment variables (secrets shared with other processes). */
const ENV: { key: string; label: string; required: boolean }[] = [
  { key: "DATABASE_URL", label: "Postgres connection", required: true },
  { key: "APP_ENCRYPTION_KEY", label: "Encryption key for secrets at rest (shared with the WhatsApp gateway)", required: true },
  { key: "CRON_SECRET", label: "Protects the reminders cron endpoint", required: true },
];

export default async function SystemStatus() {
  await requirePlatform("settings.manage");
  const s = await getSettings();
  const base = (s["general.appUrl"] ?? "").replace(/\/$/, "");
  const [ai, tg, stripe, gw] = await Promise.all([
    isLiveMode(),
    telegramConfigured(),
    stripeEnabled(),
    (await gatewayConfigured()) ? waHealth().then(() => true).catch(() => false) : Promise.resolve(null),
  ]);
  const checks = [
    { label: "AI model access", ok: ai, detail: ai ? (s["ai.enabled"] ? "Live" : "Configured but switched off in Settings") : "Offline mode (no Anthropic key)" },
    { label: "Telegram bot", ok: tg, detail: tg ? `@${s["telegram.botUsername"]}` : "Not connected" },
    { label: "WhatsApp gateway", ok: gw === true, detail: gw === null ? "Not configured" : gw ? "Reachable" : "Unreachable" },
    { label: "Stripe", ok: stripe, detail: stripe ? "Live payments" : "Test mode" },
    { label: "Public URL", ok: base.startsWith("https://"), detail: base || "Not set" },
  ];
  const urls = [
    { label: "Telegram webhook (registered from Telegram bot)", url: `${base}/api/webhooks/telegram` },
    { label: "Stripe webhook (events: checkout.session.completed, customer.subscription.updated / deleted)", url: `${base}/api/webhooks/stripe` },
    { label: "Reminders cron (GET every 10–15 min, Authorization: Bearer CRON_SECRET)", url: `${base}/api/cron/reminders` },
    { label: "WhatsApp gateway → web (internal network only; set WEB_URL on the gateway)", url: `${base}/api/internal/whatsapp` },
  ];
  return (
    <>
      <PageHeader eyebrow="Platform" title="System status" description="Health of each integration, infrastructure variables and the endpoints to configure. Product settings are in Settings." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Integrations" />
          <div className="divide-y divide-border text-[14px]">
            {checks.map((c) => (
              <div key={c.label} className="flex items-center justify-between gap-3 px-5 py-3">
                <div><div className="font-medium">{c.label}</div><div className="text-[13px] text-muted">{c.detail}</div></div>
                <Badge tone={c.ok ? "ok" : "warn"}>{c.ok ? "OK" : "Check"}</Badge>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <CardHeader title="Infrastructure (environment)" description="Set on the server; values are never displayed." />
          <div className="divide-y divide-border text-[14px]">
            {ENV.map((e) => {
              const set = Boolean(process.env[e.key]);
              return (
                <div key={e.key} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0"><div className="font-mono text-[12px]">{e.key}</div><div className="text-[13px] text-muted">{e.label}</div></div>
                  {set ? <Badge tone="ok" icon="check">Set</Badge> : <Badge tone={e.required ? "warn" : "neutral"}>Not set</Badge>}
                </div>
              );
            })}
          </div>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Endpoints" />
          <div className="divide-y divide-border">
            {urls.map((u) => (
              <div key={u.url} className="px-5 py-3">
                <div className="text-[13px] text-muted">{u.label}</div>
                <code className="mt-1 block break-all rounded-md bg-subtle px-2 py-1 font-mono text-[12px]">{u.url}</code>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
