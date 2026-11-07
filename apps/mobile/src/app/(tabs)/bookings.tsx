import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { BookingRowView } from "../../components/domain";
import { Button, Empty, ErrorBox, Loading, RowList, Screen, Segmented, T } from "../../components/ui";
import { addDays, dateLabel, dayRange, fmtMoney, todayIn } from "../../lib/format";
import { useApi } from "../../lib/hooks";
import { useBusiness } from "../../lib/session";
import { radius, space, useTheme } from "../../lib/theme";
import type { BookingRow } from "../../lib/types";

const PAST_DAYS = 7;
const FUTURE_DAYS = 45;

export default function Bookings() {
  const business = useBusiness();
  const t = useTheme();
  const today = todayIn(business.timezone);
  const [date, setDate] = useState(today);
  const [show, setShow] = useState<"active" | "all">("active");

  const days = useMemo(() => Array.from({ length: PAST_DAYS + FUTURE_DAYS }, (_, i) => addDays(today, i - PAST_DAYS)), [today]);
  const range = dayRange(date, business.timezone);
  const state = useApi<{ bookings: BookingRow[] }>("/api/v1/bookings", range);

  const bookings = (state.data?.bookings ?? []).filter((b) => show === "all" || (b.status !== "cancelled" && b.status !== "no_show"));
  const revenue = bookings.filter((b) => b.status !== "cancelled" && b.status !== "no_show").reduce((s, b) => s + b.priceCents, 0);
  const DAY_W = 54;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ paddingTop: space.sm, paddingBottom: space.md, gap: space.md, borderBottomWidth: 0.5, borderBottomColor: t.border }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: space.lg, gap: 6 }}
          contentOffset={{ x: Math.max(0, (PAST_DAYS - 2) * (DAY_W + 6)), y: 0 }}
        >
          {days.map((d) => {
            const active = d === date;
            const isToday = d === today;
            return (
              <Pressable
                key={d}
                onPress={() => setDate(d)}
                style={{ width: DAY_W, paddingVertical: 8, alignItems: "center", borderRadius: radius.md, backgroundColor: active ? t.accent : t.surface, borderWidth: 0.5, borderColor: active ? t.accent : t.border }}
              >
                <Text style={{ fontSize: 11, fontWeight: "600", color: active ? t.accentText : t.textMuted }}>{dateLabel(d, { weekday: "short" })}</Text>
                <Text style={{ fontSize: 18, fontWeight: "700", color: active ? t.accentText : t.text }}>{dateLabel(d, { day: "numeric" })}</Text>
                <View style={{ width: 4, height: 4, borderRadius: 2, marginTop: 2, backgroundColor: isToday ? (active ? t.accentText : t.text) : "transparent" }} />
              </Pressable>
            );
          })}
        </ScrollView>
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: space.lg, gap: space.md }}>
          <View style={{ flex: 1 }}>
            <T v="heading">{dateLabel(date, { weekday: "long", day: "numeric", month: "long" })}</T>
            <T v="caption" muted>
              {bookings.length} booking{bookings.length === 1 ? "" : "s"} · {fmtMoney(revenue, business.currency)}
            </T>
          </View>
          {date !== today ? <Button title="Today" variant="secondary" small onPress={() => setDate(today)} /> : null}
          <Button title="+ New" small onPress={() => router.push({ pathname: "/booking/new", params: { date } })} />
        </View>
        <View style={{ paddingHorizontal: space.lg }}>
          <Segmented
            small
            value={show}
            onChange={setShow}
            options={[
              { value: "active", label: "Active" },
              { value: "all", label: "Include cancelled" },
            ]}
          />
        </View>
      </View>
      {state.loading && !state.data ? (
        <Loading />
      ) : (
        <Screen refreshing={state.refreshing} onRefresh={state.refresh}>
          {state.error ? <ErrorBox message={state.error} onRetry={state.reload} /> : null}
          {bookings.length === 0 && !state.error ? (
            <Empty title="Nothing booked" body={date < today ? "No bookings on this day." : "Open slots on this day are bookable from your page and by your assistant."} />
          ) : (
            <RowList>{bookings.map((b) => <BookingRowView key={b.id} b={b} />)}</RowList>
          )}
        </Screen>
      )}
    </View>
  );
}
