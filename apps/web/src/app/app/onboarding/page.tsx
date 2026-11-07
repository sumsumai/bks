import { redirect } from "next/navigation";
import { onboard } from "@/actions/workspace";
import { SubmitButton } from "@/components/client";
import { Card, Field, Input, Logo, Select, Textarea } from "@/components/ui";
import { ActionForm } from "@/components/workspace/action-form";
import { requireUser } from "@/lib/auth";
import { CATEGORIES } from "@/lib/businesses";
import { membershipsOf } from "@/lib/tenant";

export const metadata = { title: "Set up your business" };

const TIMEZONES = ["Europe/Paris", "Europe/London", "Europe/Berlin", "Europe/Madrid", "Europe/Lisbon", "Europe/Amsterdam", "Europe/Brussels", "Europe/Zurich", "America/New_York", "America/Chicago", "America/Los_Angeles", "America/Toronto", "Asia/Dubai", "Asia/Singapore", "Australia/Sydney"];

export default async function Onboarding({ searchParams }: { searchParams: Promise<{ another?: string }> }) {
  const user = await requireUser("/app/onboarding");
  const { another } = await searchParams;
  if (!another && (await membershipsOf(user.id)).length) redirect("/app");

  return (
    <div className="min-h-dvh bg-subtle/50 px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <Logo />
        <h1 className="mt-10 text-[32px] font-semibold tracking-tight">Let&apos;s set up your business</h1>
        <p className="mt-1 text-muted">Two minutes. We&apos;ll create your booking page and provision your own NanoClaw AI assistant.</p>

        <ActionForm action={onboard} className="mt-8 space-y-6">
          <Card className="space-y-4 p-6">
            <div className="text-[13px] font-semibold uppercase tracking-wider text-faint">1 · Your business</div>
            <Field label="Business name"><Input name="name" required placeholder="e.g. Atelier Nord" autoFocus /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Category">
                <Select name="category" defaultValue="hair">{CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</Select>
              </Field>
              <Field label="City"><Input name="city" placeholder="Paris" /></Field>
              <Field label="Timezone">
                <Select name="timezone" defaultValue="Europe/Paris">{TIMEZONES.map((z) => <option key={z}>{z}</option>)}</Select>
              </Field>
              <Field label="Currency">
                <Select name="currency" defaultValue="EUR">{["EUR", "GBP", "USD", "CHF", "CAD", "AUD", "AED", "SGD"].map((c) => <option key={c}>{c}</option>)}</Select>
              </Field>
              <Field label="Phone" hint="optional"><Input name="phone" type="tel" /></Field>
              <Field label="Language">
                <Select name="language" defaultValue="en"><option value="en">English</option><option value="fr">Français</option><option value="es">Español</option><option value="de">Deutsch</option><option value="pt">Português</option></Select>
              </Field>
            </div>
            <Field label="Short description" hint="your agent learns from this"><Textarea name="description" rows={3} placeholder="What you do, what makes you different, who you serve." /></Field>
          </Card>

          <Card className="space-y-4 p-6">
            <div className="text-[13px] font-semibold uppercase tracking-wider text-faint">2 · Your first service</div>
            <Field label="Service name"><Input name="serviceName" placeholder="e.g. Haircut" /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Duration (minutes)"><Input name="serviceMinutes" type="number" min={5} step={5} defaultValue={60} /></Field>
              <Field label="Price"><Input name="servicePrice" type="number" min={0} step="0.01" placeholder="45" /></Field>
            </div>
            <p className="text-[13px] text-muted">We&apos;ll add you as the first team member, open Monday–Friday 9:00–18:00. You can change everything later.</p>
          </Card>

          <Card className="space-y-4 p-6">
            <div className="text-[13px] font-semibold uppercase tracking-wider text-faint">3 · Your assistant&apos;s voice</div>
            <div className="grid gap-2 sm:grid-cols-5">
              {[
                ["warm", "Warm"],
                ["professional", "Professional"],
                ["playful", "Playful"],
                ["luxury", "Luxury"],
                ["concise", "Concise"],
              ].map(([v, l], i) => (
                <label key={v} className="cursor-pointer rounded-lg border border-border bg-surface px-3 py-2.5 text-center text-[14px] has-checked:border-fg has-checked:ring-2 has-checked:ring-fg/10">
                  <input type="radio" name="tone" value={v} defaultChecked={i === 0} className="sr-only" />
                  {l}
                </label>
              ))}
            </div>
          </Card>

          <SubmitButton size="lg" className="w-full" pendingText="Provisioning your assistant…" icon="sparkles">Create my business</SubmitButton>
        </ActionForm>
      </div>
    </div>
  );
}
