import { useState } from "react";
import { View } from "react-native";
import { Card, Divider, ErrorBox, Gate, Pill, Screen, Segmented, T } from "../../components/ui";
import { api, errorMessage } from "../../lib/api";
import { useApi } from "../../lib/hooks";
import { space } from "../../lib/theme";
import type { AgentView, ToolMode } from "../../lib/types";

const MODES: { value: ToolMode; label: string }[] = [
  { value: "auto", label: "Allowed" },
  { value: "approve", label: "Ask first" },
  { value: "off", label: "Off" },
];

export default function Permissions() {
  const state = useApi<AgentView>("/api/v1/agent");
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const change = async (tool: string, mode: ToolMode) => {
    setSaving(tool);
    setError(null);
    const prev = state.data;
    state.setData((d) => (d ? { ...d, tools: d.tools.map((x) => (x.name === tool ? { ...x, mode } : x)) } : d));
    try {
      const next = await api<AgentView>("/api/v1/agent", { method: "PATCH", body: { permissions: { [tool]: mode } } });
      state.setData((d) => (d ? { ...d, ...next } : next));
    } catch (e) {
      state.setData(() => prev);
      setError(errorMessage(e));
    } finally {
      setSaving(null);
    }
  };

  return (
    <Gate state={state}>
      {(d) => (
        <Screen refreshing={state.refreshing} onRefresh={state.refresh}>
          <T v="body" muted>
            Decide what your assistant can do on its own. “Ask first” queues the action and notifies you; the customer is told the team will confirm.
          </T>
          {error ? <ErrorBox message={error} /> : null}
          <Card padded={false}>
            {d.tools.map((tool, i) => (
              <View key={tool.name}>
                {i > 0 ? <Divider /> : null}
                <View style={{ padding: space.lg, gap: space.sm }}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm }}>
                    <T v="heading" style={{ flex: 1 }}>{tool.label}</T>
                    {tool.locked ? <Pill label="Always on" tone="info" /> : saving === tool.name ? <T v="caption" faint>Saving…</T> : null}
                  </View>
                  {tool.locked ? (
                    <T v="caption" muted>Escalating to a human can't be disabled.</T>
                  ) : (
                    <Segmented small value={tool.mode} options={MODES} onChange={(m) => change(tool.name, m)} />
                  )}
                </View>
              </View>
            ))}
          </Card>
        </Screen>
      )}
    </Gate>
  );
}
