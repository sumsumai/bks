import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Button, Card, ErrorBox, Field, Gate, Screen, Section, ToggleRow } from "../../components/ui";
import { api } from "../../lib/api";
import { useApi, useMutation } from "../../lib/hooks";
import { useSession } from "../../lib/session";
import { space } from "../../lib/theme";
import type { Business } from "../../lib/types";

type Form = Pick<Business, "name" | "tagline" | "description" | "city" | "phone" | "email" | "website" | "published">;

export default function BusinessInfo() {
  const state = useApi<{ business: Business }>("/api/v1/business");
  const { refreshMe } = useSession();
  const mutation = useMutation();
  const [form, setForm] = useState<Form | null>(null);

  useEffect(() => {
    const b = state.data?.business;
    if (b && !form) setForm({ name: b.name, tagline: b.tagline, description: b.description, city: b.city, phone: b.phone, email: b.email, website: b.website, published: b.published });
  }, [state.data, form]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const save = () =>
    mutation.run(async () => {
      if (!form) return;
      await api("/api/v1/business", { method: "PATCH", body: { ...form, name: form.name.trim() } });
      await refreshMe().catch(() => {});
      router.back();
    });

  return (
    <Gate state={state}>
      {() =>
        !form ? null : (
          <Screen>
            <Card padded={false}>
              <ToggleRow label="Booking page published" hint="Visible in the marketplace and bookable online" value={form.published} onChange={(v) => set("published", v)} />
            </Card>
            <Section title="Profile">
              <Card style={{ gap: space.md }}>
                <Field label="Name" value={form.name} onChangeText={(v) => set("name", v)} maxLength={80} />
                <Field label="Tagline" value={form.tagline} onChangeText={(v) => set("tagline", v)} maxLength={140} placeholder="One line customers see first" />
                <Field label="Description" value={form.description} onChangeText={(v) => set("description", v)} multiline maxLength={4000} style={{ minHeight: 140 }} hint="Your assistant uses this to describe you." />
              </Card>
            </Section>
            <Section title="Contact">
              <Card style={{ gap: space.md }}>
                <Field label="City" value={form.city} onChangeText={(v) => set("city", v)} />
                <Field label="Phone" value={form.phone} onChangeText={(v) => set("phone", v)} keyboardType="phone-pad" />
                <Field label="Email" value={form.email} onChangeText={(v) => set("email", v)} keyboardType="email-address" autoCapitalize="none" />
                <Field label="Website" value={form.website} onChangeText={(v) => set("website", v)} autoCapitalize="none" keyboardType="url" />
              </Card>
            </Section>
            {mutation.error ? <ErrorBox message={mutation.error} /> : null}
            <Button title="Save" onPress={save} busy={mutation.busy} disabled={!form.name.trim()} />
          </Screen>
        )
      }
    </Gate>
  );
}
