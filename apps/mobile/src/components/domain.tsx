import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { api, errorMessage } from "../lib/api";
import { CHANNEL_LABEL, fmtMoney, fmtTime, relativeTime, SOURCE_LABEL, STATUS_LABEL } from "../lib/format";
import { useBusiness, useSession } from "../lib/session";
import { space, useTheme } from "../lib/theme";
import type { AgentAction, BookingRow, BookingStatus } from "../lib/types";
import { Avatar, Button, Card, ErrorBox, Pill, Row, T, type Tone } from "./ui";

export const bookingTone = (s: BookingStatus): Tone =>
  s === "confirmed" ? "positive" : s === "pending" ? "warning" : s === "cancelled" || s === "no_show" ? "danger" : "neutral";

export function BookingStatusPill({ status }: { status: BookingStatus }) {
  return <Pill label={STATUS_LABEL[status] ?? status} tone={bookingTone(status)} />;
}

/** One booking as a row: time column, customer + service, status. */
export function BookingRowView({ b }: { b: BookingRow }) {
  const business = useBusiness();
  const t = useTheme();
  const dim = b.status === "cancelled" || b.status === "no_show";
  return (
    <Row
      onPress={() => router.push({ pathname: "/booking/[id]", params: { id: b.id } })}
      left={
        <View style={{ width: 52, alignItems: "flex-start" }}>
          <T v="heading" style={{ opacity: dim ? 0.5 : 1 }}>{fmtTime(b.startsAt, business.timezone)}</T>
          <T v="caption" faint>{b.service.durationMinutes} min</T>
        </View>
      }
      title={
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: b.staff.color }} />
          <T v="heading" numberOfLines={1} style={{ flexShrink: 1, textDecorationLine: dim ? "line-through" : "none", color: dim ? t.textMuted : t.text }}>
            {b.customer.name}
          </T>
        </View>
      }
      subtitle={`${b.service.name} · ${b.staff.name} · ${fmtMoney(b.priceCents, business.currency)}${b.source !== "owner" ? ` · ${SOURCE_LABEL[b.source]}` : ""}`}
      right={b.status !== "confirmed" ? <BookingStatusPill status={b.status} /> : undefined}
    />
  );
}

/** A pending agent action with approve / reject. Calls onDecided after the server accepts the decision. */
export function ApprovalCard({ action, onDecided }: { action: AgentAction; onDecided: () => void }) {
  const { refreshCounts } = useSession();
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const decide = async (decision: "approve" | "reject") => {
    setBusy(decision);
    setError(null);
    try {
      await api(`/api/v1/approvals/${action.id}`, { method: "POST", body: { decision } });
      onDecided();
      void refreshCounts();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card style={{ gap: space.md }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <Avatar name={action.customerName ?? "Customer"} size={28} />
        <View style={{ flex: 1 }}>
          <T v="label">{action.customerName ?? "Unknown customer"}</T>
          <T v="caption" muted>
            {action.channel ? CHANNEL_LABEL[action.channel] : "Agent"} · {relativeTime(action.createdAt)} ago
          </T>
        </View>
        <Pill label="Needs approval" tone="warning" />
      </View>
      <T v="body">{action.summary || action.tool}</T>
      {error ? <ErrorBox message={error} /> : null}
      <View style={{ flexDirection: "row", gap: space.sm }}>
        <Button title="Reject" variant="secondary" onPress={() => decide("reject")} busy={busy === "reject"} disabled={!!busy} style={{ flex: 1 }} />
        <Button title="Approve" onPress={() => decide("approve")} busy={busy === "approve"} disabled={!!busy} style={{ flex: 1 }} />
      </View>
      {action.conversationId ? (
        <Button
          title="Open conversation"
          variant="ghost"
          small
          onPress={() => router.push({ pathname: "/conversation/[id]", params: { id: action.conversationId! } })}
          style={{ alignSelf: "center" }}
        />
      ) : null}
    </Card>
  );
}
