import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SlotPicker, type PickedTime } from "../../components/SlotPicker";
import { Button, Card, Empty, ErrorBox, Field, Loading, Screen, Section, T } from "../../components/ui";
import { api } from "../../lib/api";
import { fmtMoney } from "../../lib/format";
import { useApi, useMutation } from "../../lib/hooks";
import { useBusiness } from "../../lib/session";
import { radius, space, useTheme } from "../../lib/theme";
import type { BookingRow, Service, Staff } from "../../lib/types";

export default function NewBooking() {
  const { date } = useLocalSearchParams<{ date?: string }>();
  const business = useBusiness();
  const t = useTheme();
  const services = useApi<{ services: Service[] }>("/api/v1/services");
  const staff = useApi<{ staff: Staff[] }>("/api/v1/staff");
  const mutation = useMutation();
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [staffId, setStaffId] = useState<string | null>(null);
  const [picked, setPicked] = useState<PickedTime>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");

  if ((services.loading && !services.data) || (staff.loading && !staff.data)) return <Loading />;
  const active = (services.data?.services ?? []).filter((s) => s.active);
  const service = active.find((s) => s.id === serviceId) ?? null;
  const team = (staff.data?.staff ?? []).filter((s) => s.active && (!service || !service.staffIds.length || service.staffIds.includes(s.id)));

  const submit = () =>
    mutation.run(async () => {
      if (!service || !picked) throw new Error("Choose a service and a time");
      if (!name.trim()) throw new Error("Enter the customer's name");
      const r = await api<{ booking: BookingRow }>("/api/v1/bookings", {
        method: "POST",
        body: {
          serviceId: service.id,
          staffId,
          startsAt: picked.startsAt,
          override: picked.override || undefined,
          customer: { name: name.trim(), phone: phone.trim() || null, email: email.trim() || null },
          notes: notes.trim() || undefined,
        },
      });
      router.replace({ pathname: "/booking/[id]", params: { id: r.booking.id } });
    });

  const chip = (on: boolean) => ({ paddingVertical: 9, paddingHorizontal: 14, borderRadius: radius.md, borderWidth: 0.5, borderColor: on ? t.accent : t.border, backgroundColor: on ? t.accent : t.surface });

  return (
    <Screen>
      {services.error ? <ErrorBox message={services.error} onRetry={services.reload} /> : null}
      <Section title="Service">
        {active.length === 0 ? (
          <Empty title="No active services" body="Add a service first (More → Services)." />
        ) : (
          <Card padded={false}>
            {active.map((s, i) => (
              <Pressable
                key={s.id}
                onPress={() => {
                  setServiceId(s.id);
                  setStaffId(null);
                }}
                style={{ padding: space.lg, flexDirection: "row", alignItems: "center", gap: space.md, borderTopWidth: i ? 0.5 : 0, borderTopColor: t.border, backgroundColor: s.id === serviceId ? t.surfaceAlt : "transparent" }}
              >
                <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: s.id === serviceId ? t.text : t.border, alignItems: "center", justifyContent: "center" }}>
                  {s.id === serviceId ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.text }} /> : null}
                </View>
                <View style={{ flex: 1 }}>
                  <T v="heading">{s.name}</T>
                  <T v="caption" muted>{s.durationMinutes} min</T>
                </View>
                <T v="heading">{fmtMoney(s.priceCents, business.currency)}</T>
              </Pressable>
            ))}
          </Card>
        )}
      </Section>

      {service && team.length > 1 ? (
        <Section title="With">
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <Pressable onPress={() => setStaffId(null)} style={chip(staffId === null)}>
              <Text style={{ color: staffId === null ? t.accentText : t.text, fontWeight: "600" }}>Anyone</Text>
            </Pressable>
            {team.map((s) => (
              <Pressable key={s.id} onPress={() => setStaffId(s.id)} style={chip(staffId === s.id)}>
                <Text style={{ color: staffId === s.id ? t.accentText : t.text, fontWeight: "600" }}>{s.name}</Text>
              </Pressable>
            ))}
          </View>
        </Section>
      ) : null}

      <Section title="When">
        <Card>
          <SlotPicker serviceId={serviceId} staffId={staffId} initialDate={date} onChange={setPicked} />
        </Card>
      </Section>

      <Section title="Customer">
        <Card style={{ gap: space.md }}>
          <Field label="Name" value={name} onChangeText={setName} autoCapitalize="words" />
          <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" hint="Existing customers are matched by phone or email." />
          <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
          <Field label="Notes" value={notes} onChangeText={setNotes} multiline placeholder="Internal notes (optional)" />
        </Card>
      </Section>

      {mutation.error ? <ErrorBox message={mutation.error} /> : null}
      <Button title="Create booking" onPress={submit} busy={mutation.busy} disabled={!service || !picked || !name.trim()} />
    </Screen>
  );
}
