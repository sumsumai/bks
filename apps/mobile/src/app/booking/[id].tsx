import { Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Linking, View } from "react-native";
import { BookingStatusPill } from "../../components/domain";
import { SlotPicker, type PickedTime } from "../../components/SlotPicker";
import { Avatar, Button, Card, Divider, ErrorBox, Field, Gate, Row, RowList, Screen, Section, T } from "../../components/ui";
import { api } from "../../lib/api";
import { fmtDate, fmtMoney, fmtTime, localDate, SOURCE_LABEL } from "../../lib/format";
import { useApi, useMutation } from "../../lib/hooks";
import { useBusiness } from "../../lib/session";
import { space, useTheme } from "../../lib/theme";
import type { BookingRow } from "../../lib/types";

type Action = { action: "confirm" | "complete" | "no_show" } | { action: "cancel"; reason: string } | { action: "reschedule"; startsAt: string; override?: boolean };

export default function BookingDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const business = useBusiness();
  const t = useTheme();
  const state = useApi<{ booking: BookingRow }>(`/api/v1/bookings/${id}`);
  const mutation = useMutation();
  const [mode, setMode] = useState<"view" | "cancel" | "reschedule">("view");
  const [reason, setReason] = useState("");
  const [picked, setPicked] = useState<PickedTime>(null);

  const act = (body: Action) =>
    mutation.run(async () => {
      const r = await api<{ booking: BookingRow }>(`/api/v1/bookings/${id}`, { method: "PATCH", body });
      state.setData(() => r);
      setMode("view");
      setReason("");
      setPicked(null);
    });

  return (
    <Gate state={state}>
      {({ booking: b }) => {
        const live = b.status === "pending" || b.status === "confirmed";
        const past = new Date(b.startsAt).getTime() < Date.now();
        return (
          <Screen refreshing={state.refreshing} onRefresh={state.refresh}>
            <Stack.Screen options={{ title: b.service.name }} />
            <Card style={{ gap: space.md }}>
              <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
                <View style={{ gap: 2 }}>
                  <T v="caption" muted>{fmtDate(b.startsAt, business.timezone, { weekday: "long", day: "numeric", month: "long" })}</T>
                  <T v="display">{fmtTime(b.startsAt, business.timezone)}</T>
                  <T v="body" muted>
                    {b.service.durationMinutes} min · until {fmtTime(new Date(new Date(b.startsAt).getTime() + b.service.durationMinutes * 60000), business.timezone)}
                  </T>
                </View>
                <BookingStatusPill status={b.status} />
              </View>
              <Divider />
              <View style={{ flexDirection: "row", gap: space.lg }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <T v="caption" muted>With</T>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: b.staff.color }} />
                    <T v="heading">{b.staff.name}</T>
                  </View>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <T v="caption" muted>Price</T>
                  <T v="heading">{fmtMoney(b.priceCents, business.currency)}</T>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <T v="caption" muted>Booked via</T>
                  <T v="heading">{SOURCE_LABEL[b.source] ?? b.source}</T>
                </View>
              </View>
              {b.notes ? (
                <>
                  <Divider />
                  <T v="body">{b.notes}</T>
                </>
              ) : null}
              {b.cancelReason ? <T v="caption" muted>Cancellation reason: {b.cancelReason}</T> : null}
            </Card>

            <Section title="Customer">
              <RowList>
                <Row left={<Avatar name={b.customer.name} />} title={b.customer.name} subtitle={[b.customer.phone, b.customer.email].filter(Boolean).join(" · ") || "No contact details"} />
                {b.customer.phone ? <Row title="Call" subtitle={b.customer.phone} onPress={() => Linking.openURL(`tel:${b.customer.phone}`)} /> : null}
                {b.customer.email ? <Row title="Email" subtitle={b.customer.email} onPress={() => Linking.openURL(`mailto:${b.customer.email}`)} /> : null}
              </RowList>
            </Section>

            {mutation.error ? <ErrorBox message={mutation.error} /> : null}

            {mode === "view" ? (
              <View style={{ gap: space.sm }}>
                {b.status === "pending" ? <Button title="Confirm booking" variant="positive" onPress={() => act({ action: "confirm" })} busy={mutation.busy} /> : null}
                {live && past ? (
                  <View style={{ flexDirection: "row", gap: space.sm }}>
                    <Button title="Mark completed" onPress={() => act({ action: "complete" })} busy={mutation.busy} style={{ flex: 1 }} />
                    <Button title="No-show" variant="secondary" onPress={() => act({ action: "no_show" })} disabled={mutation.busy} style={{ flex: 1 }} />
                  </View>
                ) : null}
                {live && !past ? <Button title="Reschedule" variant="secondary" onPress={() => setMode("reschedule")} /> : null}
                {live ? <Button title="Cancel booking" variant="danger" onPress={() => setMode("cancel")} /> : null}
              </View>
            ) : null}

            {mode === "cancel" ? (
              <Card style={{ gap: space.md }}>
                <T v="heading">Cancel this booking?</T>
                <T v="body" muted>The customer is told on the channel they used to book.</T>
                <Field placeholder="Reason (optional, shared with the customer)" value={reason} onChangeText={setReason} multiline />
                <View style={{ flexDirection: "row", gap: space.sm }}>
                  <Button title="Keep" variant="secondary" onPress={() => setMode("view")} style={{ flex: 1 }} />
                  <Button title="Cancel booking" variant="danger" onPress={() => act({ action: "cancel", reason })} busy={mutation.busy} style={{ flex: 1 }} />
                </View>
              </Card>
            ) : null}

            {mode === "reschedule" ? (
              <Card style={{ gap: space.md }}>
                <T v="heading">Move to…</T>
                <SlotPicker serviceId={b.service.id} staffId={b.staff.id} initialDate={localDate(new Date(b.startsAt), business.timezone)} onChange={setPicked} />
                <View style={{ flexDirection: "row", gap: space.sm }}>
                  <Button title="Back" variant="secondary" onPress={() => setMode("view")} style={{ flex: 1 }} />
                  <Button
                    title="Move booking"
                    disabled={!picked}
                    busy={mutation.busy}
                    onPress={() => picked && act({ action: "reschedule", startsAt: picked.startsAt, override: picked.override || undefined })}
                    style={{ flex: 1 }}
                  />
                </View>
              </Card>
            ) : null}
            <T v="caption" faint style={{ textAlign: "center", color: t.textFaint }}>
              Booking {b.id}
            </T>
          </Screen>
        );
      }}
    </Gate>
  );
}
