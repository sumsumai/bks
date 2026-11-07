import { Stack, router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Switch, TextInput, View } from "react-native";
import { Button, Card, Divider, Empty, ErrorBox, Gate, Screen, T } from "../../../components/ui";
import { api } from "../../../lib/api";
import { hhmmToMinutes, minutesToHHMM, WEEKDAYS } from "../../../lib/format";
import { useApi, useMutation } from "../../../lib/hooks";
import { radius, space, useTheme } from "../../../lib/theme";
import type { Hours, Staff } from "../../../lib/types";

type Range = { start: string; end: string };
type Week = Range[][]; // index = weekday (0 = Sunday)
const ORDER = [1, 2, 3, 4, 5, 6, 0];

function toWeek(hours: Hours[]): Week {
  const week: Week = Array.from({ length: 7 }, () => []);
  for (const h of [...hours].sort((a, b) => a.startMinute - b.startMinute)) week[h.weekday].push({ start: minutesToHHMM(h.startMinute), end: minutesToHHMM(h.endMinute) });
  return week;
}

function toHours(week: Week): Hours[] {
  const out: Hours[] = [];
  week.forEach((ranges, weekday) => {
    const parsed = ranges.map((r) => ({ s: hhmmToMinutes(r.start), e: hhmmToMinutes(r.end), r }));
    for (const p of parsed) {
      if (p.s == null || p.e == null) throw new Error(`${WEEKDAYS[weekday]}: use HH:MM times (e.g. 09:00).`);
      if (p.e <= p.s) throw new Error(`${WEEKDAYS[weekday]}: ${p.r.start}–${p.r.end} must end after it starts.`);
    }
    const sorted = parsed.sort((a, b) => a.s! - b.s!);
    for (let i = 1; i < sorted.length; i++) if (sorted[i].s! < sorted[i - 1].e!) throw new Error(`${WEEKDAYS[weekday]}: time ranges overlap.`);
    for (const p of sorted) out.push({ weekday, startMinute: p.s!, endMinute: p.e! });
  });
  return out;
}

export default function StaffHours() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const state = useApi<{ staff: Staff[] }>("/api/v1/staff");
  const mutation = useMutation();
  const [week, setWeek] = useState<Week | null>(null);
  const member = state.data?.staff.find((s) => s.id === id) ?? null;

  useEffect(() => {
    if (member && !week) setWeek(toWeek(member.hours));
  }, [member, week]);

  const update = (day: number, fn: (ranges: Range[]) => Range[]) => setWeek((w) => (w ? w.map((r, i) => (i === day ? fn(r) : r)) : w));

  const save = () =>
    mutation.run(async () => {
      if (!week) return;
      await api(`/api/v1/staff/${id}/availability`, { method: "PUT", body: { hours: toHours(week) } });
      router.back();
    });

  const timeInput = (value: string, onChange: (v: string) => void) => (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder="09:00"
      placeholderTextColor={t.textFaint}
      keyboardType="numbers-and-punctuation"
      maxLength={5}
      style={{ width: 72, textAlign: "center", backgroundColor: t.surfaceAlt, borderRadius: radius.sm, paddingVertical: 8, color: t.text, fontSize: 15, fontVariant: ["tabular-nums"] }}
    />
  );

  return (
    <Gate state={state}>
      {() =>
        !member ? (
          <Screen>
            <Empty title="Team member not found" />
          </Screen>
        ) : !week ? null : (
          <Screen>
            <Stack.Screen options={{ title: member.name }} />
            <T v="body" muted>Weekly working hours. Bookings can only be made inside these times.</T>
            <Card padded={false}>
              {ORDER.map((day, i) => {
                const ranges = week[day];
                const open = ranges.length > 0;
                return (
                  <View key={day}>
                    {i > 0 ? <Divider /> : null}
                    <View style={{ padding: space.lg, gap: space.sm }}>
                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                        <T v="heading" style={{ flex: 1 }}>{WEEKDAYS[day]}</T>
                        {!open ? <T v="caption" faint style={{ marginRight: space.sm }}>Closed</T> : null}
                        <Switch value={open} onValueChange={(v) => update(day, () => (v ? [{ start: "09:00", end: "18:00" }] : []))} />
                      </View>
                      {ranges.map((r, ri) => (
                        <View key={ri} style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                          {timeInput(r.start, (v) => update(day, (rs) => rs.map((x, xi) => (xi === ri ? { ...x, start: v } : x))))}
                          <T muted>–</T>
                          {timeInput(r.end, (v) => update(day, (rs) => rs.map((x, xi) => (xi === ri ? { ...x, end: v } : x))))}
                          <View style={{ flex: 1 }} />
                          {ranges.length > 1 ? <Button title="Remove" variant="ghost" small onPress={() => update(day, (rs) => rs.filter((_, xi) => xi !== ri))} /> : null}
                        </View>
                      ))}
                      {open ? (
                        <Button
                          title="+ Add break / split shift"
                          variant="ghost"
                          small
                          style={{ alignSelf: "flex-start", paddingHorizontal: 0 }}
                          onPress={() => update(day, (rs) => [...rs, { start: rs.length ? rs[rs.length - 1].end : "14:00", end: "18:00" }])}
                        />
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </Card>
            {mutation.error ? <ErrorBox message={mutation.error} /> : null}
            <Button title="Save hours" onPress={save} busy={mutation.busy} />
          </Screen>
        )
      }
    </Gate>
  );
}
