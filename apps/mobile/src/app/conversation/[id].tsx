import { Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View, type ScrollViewInstance } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, ErrorBox, Gate, Pill, T } from "../../components/ui";
import { api, errorMessage } from "../../lib/api";
import { CHANNEL_LABEL, fmtDateTime, fmtTime } from "../../lib/format";
import { useApi } from "../../lib/hooks";
import { useBusiness, useSession } from "../../lib/session";
import { radius, space, useTheme } from "../../lib/theme";
import type { AgentAction, ConversationDetail, Message } from "../../lib/types";

type Item = { kind: "message"; at: string; m: Message } | { kind: "action"; at: string; a: AgentAction };

const ACTION_TONE: Record<string, "positive" | "warning" | "danger" | "neutral"> = {
  executed: "positive",
  approved: "positive",
  pending_approval: "warning",
  rejected: "danger",
  failed: "danger",
  expired: "neutral",
};

export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const business = useBusiness();
  const { refreshCounts } = useSession();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const state = useApi<{ conversation: ConversationDetail }>(`/api/v1/conversations/${id}`);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroll = useRef<ScrollViewInstance>(null);

  // Live-ish thread: refresh every 5s while this screen is focused.
  useFocusEffect(
    useCallback(() => {
      const timer = setInterval(state.reload, 5000);
      return () => clearInterval(timer);
    }, [state.reload]),
  );

  const items = useMemo<Item[]>(() => {
    const c = state.data?.conversation;
    if (!c) return [];
    return [
      ...c.messages.map((m) => ({ kind: "message" as const, at: m.createdAt, m })),
      ...c.actions.map((a) => ({ kind: "action" as const, at: a.createdAt, a })),
    ].sort((a, b) => a.at.localeCompare(b.at));
  }, [state.data]);

  const patch = async (action: "takeover" | "release" | "close" | "reopen") => {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/v1/conversations/${id}`, { method: "PATCH", body: { action } });
      state.reload();
      void refreshCounts();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setSending(true);
    setError(null);
    try {
      await api(`/api/v1/conversations/${id}/messages`, { method: "POST", body: { text: body } });
      setText("");
      state.reload();
      void refreshCounts();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <Gate state={state}>
      {({ conversation: c }) => {
        const name = c.customer?.name ?? "Visitor";
        const human = c.humanTakeover;
        return (
          <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}>
            <Stack.Screen options={{ title: name }} />
            <View style={{ paddingHorizontal: space.lg, paddingVertical: space.sm, gap: space.sm, borderBottomWidth: 0.5, borderBottomColor: t.border }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" }}>
                <Pill label={CHANNEL_LABEL[c.channel]} />
                {c.status === "escalated" ? <Pill label="Needs you" tone="danger" /> : null}
                {c.status === "closed" ? <Pill label="Closed" /> : null}
                <Pill label={human ? "You're replying" : "Assistant replying"} tone={human ? "info" : "positive"} />
              </View>
              {c.escalationReason ? <T v="caption" muted>Escalated: {c.escalationReason}</T> : null}
              <View style={{ flexDirection: "row", gap: space.sm }}>
                {human ? (
                  <Button title="Hand back to assistant" variant="secondary" small onPress={() => patch("release")} busy={busy} style={{ flex: 1 }} />
                ) : (
                  <Button title="Take over" variant="secondary" small onPress={() => patch("takeover")} busy={busy} style={{ flex: 1 }} />
                )}
                {c.status === "closed" ? (
                  <Button title="Reopen" variant="ghost" small onPress={() => patch("reopen")} disabled={busy} />
                ) : (
                  <Button title="Close" variant="ghost" small onPress={() => patch("close")} disabled={busy} />
                )}
              </View>
            </View>

            <ScrollView
              ref={scroll}
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: space.lg, gap: space.sm }}
              onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}
              keyboardShouldPersistTaps="handled"
            >
              {items.length === 0 ? <T v="body" muted style={{ textAlign: "center" }}>No messages yet.</T> : null}
              {items.map((it) =>
                it.kind === "action" ? (
                  <View key={it.a.id} style={{ alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 6, maxWidth: "90%", paddingVertical: 4 }}>
                    <Text style={{ color: t.textFaint, fontSize: 12 }}>✦</Text>
                    <Text style={{ color: t.textMuted, fontSize: 12, flexShrink: 1 }} numberOfLines={2}>
                      {it.a.summary || it.a.tool}
                    </Text>
                    <Pill label={it.a.status.replace("_", " ")} tone={ACTION_TONE[it.a.status] ?? "neutral"} />
                  </View>
                ) : it.m.role === "system" ? (
                  <Text key={it.m.id} style={{ alignSelf: "center", color: t.textFaint, fontSize: 12, paddingVertical: 4 }}>
                    {it.m.content} · {fmtTime(it.m.createdAt, business.timezone)}
                  </Text>
                ) : (
                  <Bubble key={it.m.id} m={it.m} tz={business.timezone} />
                ),
              )}
            </ScrollView>

            {error ? (
              <View style={{ paddingHorizontal: space.lg }}>
                <ErrorBox message={error} />
              </View>
            ) : null}
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: space.sm, padding: space.md, paddingBottom: Math.max(space.md, insets.bottom), borderTopWidth: 0.5, borderTopColor: t.border, backgroundColor: t.surface }}>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder={human ? `Reply to ${name}…` : "Reply (takes over from the assistant)…"}
                placeholderTextColor={t.textFaint}
                multiline
                style={{ flex: 1, maxHeight: 120, minHeight: 40, backgroundColor: t.surfaceAlt, borderRadius: radius.lg, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, color: t.text, fontSize: 15 }}
              />
              <Pressable
                onPress={send}
                disabled={sending || !text.trim()}
                style={{ height: 40, paddingHorizontal: 16, borderRadius: 20, backgroundColor: t.accent, alignItems: "center", justifyContent: "center", opacity: sending || !text.trim() ? 0.4 : 1 }}
              >
                <Text style={{ color: t.accentText, fontWeight: "700" }}>{sending ? "…" : "Send"}</Text>
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        );
      }}
    </Gate>
  );
}

function Bubble({ m, tz }: { m: Message; tz: string }) {
  const t = useTheme();
  const mine = m.role !== "customer";
  const bg = m.role === "customer" ? t.bubbleCustomer : m.role === "owner" ? t.bubbleOwner : t.bubbleAgent;
  const fg = m.role === "customer" ? t.text : m.role === "owner" ? t.bubbleOwnerText : t.bubbleAgentText;
  return (
    <View style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "82%", gap: 2 }}>
      <View
        style={{
          backgroundColor: bg,
          borderRadius: radius.xl,
          borderBottomRightRadius: mine ? 6 : radius.xl,
          borderBottomLeftRadius: mine ? radius.xl : 6,
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderWidth: m.role === "customer" ? 0.5 : 0,
          borderColor: t.border,
        }}
      >
        <Text style={{ color: fg, fontSize: 15, lineHeight: 21 }}>{m.content}</Text>
      </View>
      <Text style={{ color: t.textFaint, fontSize: 11, alignSelf: mine ? "flex-end" : "flex-start", paddingHorizontal: 6 }}>
        {m.role === "agent" ? "Assistant · " : m.role === "owner" ? "Team · " : ""}
        {fmtDateTime(m.createdAt, tz)}
      </Text>
    </View>
  );
}
