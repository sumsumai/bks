import { router } from "expo-router";
import { Empty, Gate, Pill, Row, RowList, Screen, T } from "../../components/ui";
import { CHANNEL_LABEL, fmtDateTime } from "../../lib/format";
import { useApi } from "../../lib/hooks";
import { useBusiness } from "../../lib/session";
import type { AgentAction } from "../../lib/types";

const TONE: Record<string, "positive" | "warning" | "danger" | "neutral"> = {
  executed: "positive",
  approved: "positive",
  pending_approval: "warning",
  rejected: "danger",
  failed: "danger",
  expired: "neutral",
};

/** Audit trail: every tool call the assistant made, including blocked and failed ones. */
export default function ActionsLog() {
  const business = useBusiness();
  const state = useApi<{ actions: AgentAction[] }>("/api/v1/approvals", { status: "all" });
  return (
    <Gate state={state}>
      {({ actions }) => (
        <Screen refreshing={state.refreshing} onRefresh={state.refresh}>
          <T v="body" muted>Every action your assistant took or asked to take, newest first.</T>
          {actions.length === 0 ? (
            <Empty title="No activity yet" body="Bookings, lookups and escalations by your assistant are recorded here." />
          ) : (
            <RowList>
              {actions.map((a) => (
                <Row
                  key={a.id}
                  title={a.summary || a.tool}
                  subtitle={`${a.customerName ?? "Visitor"}${a.channel ? ` · ${CHANNEL_LABEL[a.channel]}` : ""} · ${fmtDateTime(a.createdAt, business.timezone)}`}
                  right={<Pill label={a.status.replace("_", " ")} tone={TONE[a.status] ?? "neutral"} />}
                  onPress={a.conversationId ? () => router.push({ pathname: "/conversation/[id]", params: { id: a.conversationId! } }) : undefined}
                />
              ))}
            </RowList>
          )}
        </Screen>
      )}
    </Gate>
  );
}
