import { SettingsForm } from "@/components/admin/settings-form";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { requirePlatform } from "@/lib/auth";
import { describeSettings } from "@/lib/settings";

export const metadata = { title: "Settings" };

const GROUPS = [
  { id: "general", title: "General", description: "Public URL, sign-ups and publishing." },
  { id: "ai", title: "AI agents", description: "Model access and behaviour for every business's NanoClaw agent." },
  { id: "billing", title: "Billing (Stripe)", description: "Without a Stripe key, plan changes apply immediately in test mode. Prices are set per plan in Plans & pricing." },
  { id: "reminders", title: "Reminders", description: "Automatic appointment reminders sent by each business's agent." },
] as const;

export default async function AdminSettings() {
  await requirePlatform("settings.manage");
  const rows = await describeSettings();
  return (
    <>
      <PageHeader eyebrow="Platform" title="Settings" description="Values saved here take effect within seconds and override environment variables. Secrets are encrypted and never shown again." />
      <div className="grid gap-6 lg:grid-cols-2">
        {GROUPS.map((g) => (
          <Card key={g.id} className="h-fit">
            <CardHeader title={g.title} description={g.description} />
            <div className="p-5">
              <SettingsForm rows={rows.filter((r) => r.group === g.id)} />
            </div>
          </Card>
        ))}
      </div>
      <p className="mt-6 text-[13px] text-muted">Telegram and WhatsApp settings live on their own pages under Channels.</p>
    </>
  );
}
