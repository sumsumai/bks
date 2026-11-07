import { Stack, router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Button, Card, Empty, ErrorBox, Field, Gate, Screen, ToggleRow } from "../../../components/ui";
import { api } from "../../../lib/api";
import { useApi, useMutation } from "../../../lib/hooks";
import { useBusiness } from "../../../lib/session";
import { space } from "../../../lib/theme";
import type { Service } from "../../../lib/types";

export default function ServiceEdit() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const business = useBusiness();
  // The API has no single-service GET; the list is small, so read it from there.
  const state = useApi<{ services: Service[] }>("/api/v1/services");
  const mutation = useMutation();
  const [form, setForm] = useState<{ name: string; description: string; price: string; duration: string; active: boolean } | null>(null);
  const service = state.data?.services.find((s) => s.id === id) ?? null;

  useEffect(() => {
    if (service && !form)
      setForm({ name: service.name, description: service.description, price: (service.priceCents / 100).toFixed(service.priceCents % 100 ? 2 : 0), duration: String(service.durationMinutes), active: service.active });
  }, [service, form]);

  const save = () =>
    mutation.run(async () => {
      if (!form) return;
      const price = Number(form.price.replace(",", "."));
      const duration = Number(form.duration);
      if (!Number.isFinite(price) || price < 0) throw new Error("Enter a valid price");
      if (!Number.isInteger(duration) || duration < 5 || duration > 600) throw new Error("Duration must be 5–600 minutes");
      await api(`/api/v1/services/${id}`, {
        method: "PATCH",
        body: { name: form.name.trim(), description: form.description, priceCents: Math.round(price * 100), durationMinutes: duration, active: form.active },
      });
      router.back();
    });

  return (
    <Gate state={state}>
      {() =>
        !service ? (
          <Screen>
            <Empty title="Service not found" />
          </Screen>
        ) : !form ? null : (
          <Screen>
            <Stack.Screen options={{ title: service.name }} />
            <Card padded={false}>
              <ToggleRow label="Bookable" hint="Hidden services can't be booked online or by your assistant." value={form.active} onChange={(v) => setForm({ ...form, active: v })} />
            </Card>
            <Card style={{ gap: space.md }}>
              <Field label="Name" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} maxLength={80} />
              <Field label={`Price (${business.currency})`} value={form.price} onChangeText={(v) => setForm({ ...form, price: v })} keyboardType="decimal-pad" />
              <Field label="Duration (minutes)" value={form.duration} onChangeText={(v) => setForm({ ...form, duration: v })} keyboardType="number-pad" />
              <Field label="Description" value={form.description} onChangeText={(v) => setForm({ ...form, description: v })} multiline maxLength={1000} />
            </Card>
            {mutation.error ? <ErrorBox message={mutation.error} /> : null}
            <Button title="Save" onPress={save} busy={mutation.busy} disabled={!form.name.trim()} />
          </Screen>
        )
      }
    </Gate>
  );
}
