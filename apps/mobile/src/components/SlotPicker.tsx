import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { api, ApiError, errorMessage } from "../lib/api";
import { addDays, dateLabel, hhmmToMinutes, todayIn, zonedToUtc } from "../lib/format";
import { useBusiness } from "../lib/session";
import { radius, space, useTheme } from "../lib/theme";
import type { Slot } from "../lib/types";
import { Field, T, ToggleRow } from "./ui";

export type PickedTime = { startsAt: string; override: boolean } | null;

/**
 * Pick a date, then an open slot for a service. Slots come from the public availability endpoint.
 * The team can also enter any time and override availability (walk-ins, favours); the server still
 * refuses overlaps with other bookings.
 */
export function SlotPicker({
  serviceId,
  staffId,
  initialDate,
  onChange,
}: {
  serviceId: string | null;
  staffId?: string | null;
  initialDate?: string;
  onChange: (picked: PickedTime) => void;
}) {
  const business = useBusiness();
  const t = useTheme();
  const today = todayIn(business.timezone);
  const [date, setDate] = useState(initialDate && initialDate >= today ? initialDate : today);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [manualTime, setManualTime] = useState("");

  const days = useMemo(() => Array.from({ length: 45 }, (_, i) => addDays(today, i)), [today]);

  useEffect(() => {
    setSelected(null);
    onChange(null);
    if (!serviceId) return;
    let cancelled = false;
    setLoading(true);
    setUnavailable(null);
    api<{ slots: Slot[] }>(`/api/v1/slots`, { query: { serviceId, date, staffId: staffId ?? undefined } })
      .then((r) => !cancelled && setSlots(r.slots))
      .catch((e) => {
        if (cancelled) return;
        setSlots(null);
        // An unpublished business has no public availability: fall back to entering a time.
        setUnavailable(e instanceof ApiError && e.status === 404 ? "Your booking page is unpublished, so open slots can't be listed. Enter a time instead." : errorMessage(e));
        setManual(true);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceId, staffId, date, business.slug]);

  useEffect(() => {
    if (!manual) return;
    const minutes = hhmmToMinutes(manualTime);
    onChange(minutes == null ? null : { startsAt: zonedToUtc(date, minutes, business.timezone).toISOString(), override: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manual, manualTime, date]);

  const chip = (active: boolean) => ({
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    backgroundColor: active ? t.accent : t.surface,
    borderWidth: 0.5,
    borderColor: active ? t.accent : t.border,
  });

  return (
    <View style={{ gap: space.md }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {days.map((d) => (
          <Pressable key={d} onPress={() => setDate(d)} style={[chip(d === date), { alignItems: "center", minWidth: 54 }]}>
            <Text style={{ fontSize: 11, color: d === date ? t.accentText : t.textMuted, fontWeight: "600" }}>{dateLabel(d, { weekday: "short" })}</Text>
            <Text style={{ fontSize: 16, color: d === date ? t.accentText : t.text, fontWeight: "700" }}>{dateLabel(d, { day: "numeric" })}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {!serviceId ? (
        <T v="caption" muted>Choose a service first.</T>
      ) : loading ? (
        <ActivityIndicator color={t.textMuted} />
      ) : !manual ? (
        slots && slots.length ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {slots.map((s) => (
              <Pressable
                key={s.startsAt}
                onPress={() => {
                  setSelected(s.startsAt);
                  onChange({ startsAt: s.startsAt, override: false });
                }}
                style={chip(selected === s.startsAt)}
              >
                <Text style={{ color: selected === s.startsAt ? t.accentText : t.text, fontWeight: "600" }}>{s.time}</Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <T v="body" muted>No open slots on {dateLabel(date, { weekday: "long", day: "numeric", month: "short" })}.</T>
        )
      ) : (
        <Field label="Time (24h)" placeholder="14:30" value={manualTime} onChangeText={setManualTime} keyboardType="numbers-and-punctuation" hint={unavailable ?? "Overrides working hours. Overlapping bookings are still refused."} />
      )}

      {!unavailable && serviceId ? (
        <View style={{ marginHorizontal: -space.lg }}>
          <ToggleRow
            label="Enter a time manually"
            hint="For walk-ins or outside working hours"
            value={manual}
            onChange={(v) => {
              setManual(v);
              setSelected(null);
              onChange(null);
            }}
          />
        </View>
      ) : null}
    </View>
  );
}
