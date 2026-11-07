import { useState } from "react";
import { View } from "react-native";
import { ApprovalCard } from "../components/domain";
import { Empty, ErrorBox, Loading, Pill, Row, RowList, Screen, Segmented, T } from "../components/ui";
import { CHANNEL_LABEL, fmtDateTime } from "../lib/format";
import { useApi } from "../lib/hooks";
import { useBusiness, useSession } from "../lib/session";
import { space, useTheme } from "../lib/theme";
import type { AgentAction } from "../lib/types";

const STATUS: Record<string, { label: string; tone: "positive" | "warning" | "danger" | "neutral" }> = {
  pending_approval: { label: "Waiting", tone: "warning" },
  approved: { label: "Approved", tone: "positive" },
  rejected: { label: "Rejected", tone: "danger" },
  failed: { label: "Failed", tone: "danger" },
  executed: { label: "Done", tone: "positive" },
  expired: { label: "Expired", tone: "neutral" },
};

export default function Approvals() {
  const t = useTheme();
  const business = useBusiness();
  const { refreshCounts } = useSession();
  const [tab, setTab] = useState<"pending" | "history">("pending");
  const pending = useApi<{ actions: AgentAction[] }>("/api/v1/approvals", { status: "pending_approval" });
  const history = useApi<{ actions: AgentAction[] }>(tab === "history" ? "/api/v1/approvals" : null, { status: "all" });
  const current = tab === "pending" ? pending : history;
  const decided = (history.data?.actions ?? []).filter((a) => ["approved", "rejected", "failed"].includes(a.status) && a.decidedAt);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ padding: space.lg, paddingBottom: 0 }}>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "pending", label: `Waiting${pending.data?.actions.length ? ` · ${pending.data.actions.length}` : ""}` },
            { value: "history", label: "Decided" },
          ]}
        />
      </View>
      {current.loading && !current.data ? (
        <Loading />
      ) : (
        <Screen refreshing={current.refreshing} onRefresh={current.refresh}>
          {current.error ? <ErrorBox message={current.error} onRetry={current.reload} /> : null}
          {tab === "pending" ? (
            (pending.data?.actions.length ?? 0) === 0 ? (
              <Empty title="All clear" body="When your assistant wants to do something you've marked “Ask first”, it waits here for you." />
            ) : (
              pending.data!.actions.map((a) => (
                <ApprovalCard
                  key={a.id}
                  action={a}
                  onDecided={() => {
                    pending.reload();
                    void refreshCounts();
                  }}
                />
              ))
            )
          ) : decided.length === 0 ? (
            <Empty title="No decisions yet" />
          ) : (
            <RowList>
              {decided.map((a) => (
                <Row
                  key={a.id}
                  title={a.summary || a.tool}
                  subtitle={`${a.customerName ?? "Customer"}${a.channel ? ` · ${CHANNEL_LABEL[a.channel]}` : ""} · ${fmtDateTime(a.decidedAt!, business.timezone)}`}
                  right={<Pill label={STATUS[a.status]?.label ?? a.status} tone={STATUS[a.status]?.tone ?? "neutral"} />}
                />
              ))}
            </RowList>
          )}
          {tab === "history" ? <T v="caption" faint style={{ textAlign: "center" }}>Showing the latest 100 agent actions.</T> : null}
        </Screen>
      )}
    </View>
  );
}
