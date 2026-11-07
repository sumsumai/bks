import { router } from "expo-router";
import { View } from "react-native";
import { ApprovalCard, BookingRowView } from "../../components/domain";
import { Button, Card, Empty, Gate, RowList, Screen, Section, Stat, T } from "../../components/ui";
import { fmtDate, fmtMoney } from "../../lib/format";
import { useApi } from "../../lib/hooks";
import { useBusiness, useSession } from "../../lib/session";
import { space, useTheme } from "../../lib/theme";
import type { Dashboard } from "../../lib/types";

export default function Today() {
  const business = useBusiness();
  const { user, refreshCounts } = useSession();
  const t = useTheme();
  const state = useApi<Dashboard>("/api/v1/dashboard");

  return (
    <Gate state={state}>
      {(d) => {
        const m = d.metrics;
        const live = d.today.filter((b) => b.status !== "cancelled");
        const nextUp = live.find((b) => new Date(b.startsAt).getTime() > Date.now() && b.status !== "no_show");
        const todayRevenue = live.filter((b) => b.status !== "no_show").reduce((s, b) => s + b.priceCents, 0);
        return (
          <Screen
            refreshing={state.refreshing}
            onRefresh={() => {
              state.refresh();
              void refreshCounts();
            }}
          >
            <View style={{ gap: 4 }}>
              <T v="caption" muted>{fmtDate(new Date(), business.timezone, { weekday: "long", day: "numeric", month: "long" })}</T>
              <T v="title">Hello{user ? `, ${user.name.split(" ")[0]}` : ""}</T>
              <T v="body" muted>
                {live.length === 0
                  ? "No appointments today."
                  : `${live.length} appointment${live.length > 1 ? "s" : ""} today · ${fmtMoney(todayRevenue, business.currency)}`}
              </T>
            </View>

            {d.counts.escalations > 0 ? (
              <Card onPress={() => router.push({ pathname: "/inbox", params: { filter: "escalated" } })} style={{ backgroundColor: t.dangerBg, borderColor: t.dangerBg }}>
                <T v="heading" color={t.danger}>
                  {d.counts.escalations} customer{d.counts.escalations > 1 ? "s" : ""} waiting for you
                </T>
                <T v="caption" color={t.danger}>Your assistant handed these conversations to a human. Tap to answer.</T>
              </Card>
            ) : null}

            {d.approvals.length > 0 ? (
              <Section title={`Needs your approval · ${d.counts.approvals}`} action={<Button title="All" variant="ghost" small onPress={() => router.push("/approvals")} />}>
                <ApprovalCard
                  action={d.approvals[0]}
                  onDecided={() => {
                    state.reload();
                    void refreshCounts();
                  }}
                />
              </Section>
            ) : null}

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.md }}>
              <Stat label="Revenue · 30 days" value={fmtMoney(m.revenueCents, business.currency)} hint={`${fmtMoney(m.upcomingRevenueCents, business.currency)} booked ahead`} />
              <Stat label="Upcoming" value={String(m.upcoming)} hint={`${m.bookings} booked in 30 days`} />
              <Stat
                label="Assistant resolved"
                value={m.resolutionRate == null ? "–" : `${Math.round(m.resolutionRate * 100)}%`}
                hint={`${m.conversations} conversations`}
                tone={m.resolutionRate != null && m.resolutionRate >= 0.8 ? "positive" : undefined}
              />
              <Stat label="Booked by assistant" value={String(m.agentBookings)} hint={`${m.newCustomers} new customers`} />
            </View>

            <Section title="Today's schedule" action={<Button title="New" variant="ghost" small onPress={() => router.push("/booking/new")} />}>
              {d.today.length === 0 ? (
                <Empty title="A quiet day" body="New bookings from your page, WhatsApp and Telegram will appear here." />
              ) : (
                <>
                  {nextUp ? (
                    <T v="caption" muted style={{ paddingHorizontal: 2 }}>
                      Next: {nextUp.customer.name} · {nextUp.service.name}
                    </T>
                  ) : null}
                  <RowList>{d.today.map((b) => <BookingRowView key={b.id} b={b} />)}</RowList>
                </>
              )}
            </Section>
          </Screen>
        );
      }}
    </Gate>
  );
}
