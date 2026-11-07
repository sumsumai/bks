import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { ApprovalCard } from "../../components/domain";
import { Button, Card, ErrorBox, Gate, Pill, Row, RowList, Screen, Section, Stat, T, ToggleRow } from "../../components/ui";
import { api, errorMessage } from "../../lib/api";
import { CHANNEL_LABEL } from "../../lib/format";
import { useApi } from "../../lib/hooks";
import { useSession } from "../../lib/session";
import { space, useTheme } from "../../lib/theme";
import type { AgentAction, AgentView } from "../../lib/types";

const TONE_LABEL: Record<string, string> = { warm: "Warm", professional: "Professional", playful: "Playful", luxury: "Luxury concierge", concise: "Concise" };

export default function AgentTab() {
  const t = useTheme();
  const { business, refreshCounts } = useSession();
  const canManage = business?.role !== "staff";
  const state = useApi<AgentView>("/api/v1/agent");
  const approvals = useApi<{ actions: AgentAction[] }>(canManage ? "/api/v1/approvals" : null);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setActive = async (active: boolean) => {
    setToggling(true);
    setError(null);
    try {
      const next = await api<AgentView>("/api/v1/agent", { method: "PATCH", body: { status: active ? "active" : "paused" } });
      state.setData((d) => (d ? { ...d, agent: next.agent } : d));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setToggling(false);
    }
  };

  return (
    <Gate state={state}>
      {(d) => {
        const { agent, metrics: m } = d;
        const active = agent.status === "active";
        const pending = approvals.data?.actions ?? [];
        const channels = d.channels.filter((c): c is NonNullable<typeof c> => !!c);
        return (
          <Screen
            refreshing={state.refreshing}
            onRefresh={() => {
              state.refresh();
              approvals.reload();
              void refreshCounts();
            }}
          >
            <Card style={{ gap: space.md }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: active ? t.positiveBg : t.surfaceAlt, alignItems: "center", justifyContent: "center" }}>
                  <T v="title" color={active ? t.positive : t.textMuted}>✦</T>
                </View>
                <View style={{ flex: 1 }}>
                  <T v="heading">{agent.name}</T>
                  <T v="caption" muted>
                    NanoClaw assistant · {TONE_LABEL[agent.persona.tone] ?? agent.persona.tone} tone
                  </T>
                </View>
                <Pill label={active ? "Live" : agent.status === "paused" ? "Paused" : agent.status} tone={active ? "positive" : "warning"} />
              </View>
              {canManage ? (
                <View style={{ marginHorizontal: -space.lg, marginBottom: -space.md }}>
                  <ToggleRow
                    label="Answer customers automatically"
                    hint={active ? "Your assistant replies on all connected channels." : "Paused: messages wait in your inbox."}
                    value={active}
                    onChange={setActive}
                    disabled={toggling}
                  />
                </View>
              ) : null}
              {error ? <ErrorBox message={error} /> : null}
            </Card>

            {canManage ? (
              <Section title={`Approvals${pending.length ? ` · ${pending.length}` : ""}`} action={<Button title="History" variant="ghost" small onPress={() => router.push("/approvals")} />}>
                {approvals.error ? <ErrorBox message={approvals.error} onRetry={approvals.reload} /> : null}
                {pending.length === 0 ? (
                  <Card>
                    <T v="body" muted>Nothing waiting. Sensitive actions you've set to “Ask first” will appear here.</T>
                  </Card>
                ) : (
                  pending.slice(0, 3).map((a) => (
                    <ApprovalCard
                      key={a.id}
                      action={a}
                      onDecided={() => {
                        approvals.reload();
                        void refreshCounts();
                      }}
                    />
                  ))
                )}
                {pending.length > 3 ? <Button title={`See all ${pending.length}`} variant="secondary" onPress={() => router.push("/approvals")} /> : null}
              </Section>
            ) : null}

            {m ? (
              <Section title="Performance · 30 days">
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.md }}>
                  <Stat label="Conversations" value={String(m.conversations)} hint={`${m.agentTurns} replies`} />
                  <Stat
                    label="Resolved without you"
                    value={m.resolutionRate == null ? "–" : `${Math.round(m.resolutionRate * 100)}%`}
                    hint={`${m.escalated} escalated`}
                    tone={m.resolutionRate != null && m.resolutionRate >= 0.8 ? "positive" : undefined}
                  />
                  <Stat label="Bookings made" value={String(m.agentBookings)} hint={`${m.actionsExecuted} actions run`} />
                  <Stat label="Avg. reply time" value={m.avgLatencyMs ? `${(m.avgLatencyMs / 1000).toFixed(1)}s` : "–"} hint={m.actionsFailed ? `${m.actionsFailed} failed actions` : "No failed actions"} tone={m.actionsFailed ? "warning" : undefined} />
                </View>
              </Section>
            ) : null}

            <Section title="Channels">
              <RowList>
                {(["whatsapp", "telegram", "web"] as const).map((kind) => {
                  const c = channels.find((x) => x.kind === kind);
                  const ok = c?.status === "connected";
                  return (
                    <Row
                      key={kind}
                      title={CHANNEL_LABEL[kind]}
                      subtitle={ok ? c?.displayName || "Connected" : kind === "whatsapp" && canManage ? "Link your WhatsApp Business" : (c?.lastError ?? "Not connected · connect from the web workspace")}
                      right={<Pill label={ok ? "Connected" : c?.status === "pairing" ? "Linking" : "Off"} tone={ok ? (c?.lastError ? "warning" : "positive") : c?.status === "pairing" ? "warning" : "neutral"} />}
                      onPress={kind === "whatsapp" && canManage ? () => router.push("/assistant/whatsapp") : undefined}
                    />
                  );
                })}
              </RowList>
            </Section>

            {canManage ? (
              <Section title="Configure">
                <RowList>
                  <Row title="Voice & instructions" subtitle="Tone, language, greeting and your house rules" onPress={() => router.push("/assistant/persona")} />
                  <Row title="Permissions" subtitle="What it may do alone, and what needs your OK" onPress={() => router.push("/assistant/permissions")} />
                  <Row title="Knowledge" subtitle="FAQs, policies and documents it learns from" onPress={() => router.push("/assistant/knowledge")} />
                  <Row title="Activity log" subtitle="Every action your assistant took" onPress={() => router.push("/assistant/actions")} />
                </RowList>
              </Section>
            ) : null}
          </Screen>
        );
      }}
    </Gate>
  );
}
