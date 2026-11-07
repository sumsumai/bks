import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { Avatar, Empty, ErrorBox, Loading, Pill, Row, RowList, Screen, Segmented, T } from "../../components/ui";
import { CHANNEL_LABEL, relativeTime } from "../../lib/format";
import { useApi } from "../../lib/hooks";
import { useSession } from "../../lib/session";
import { space, useTheme } from "../../lib/theme";
import type { ConversationListItem } from "../../lib/types";

type Filter = "all" | "escalated" | "closed";

export default function Inbox() {
  const t = useTheme();
  const params = useLocalSearchParams<{ filter?: string }>();
  const { refreshCounts } = useSession();
  const [filter, setFilter] = useState<Filter>(params.filter === "escalated" ? "escalated" : "all");
  useEffect(() => {
    if (params.filter === "escalated") setFilter("escalated");
  }, [params.filter]);

  const state = useApi<{ conversations: ConversationListItem[] }>("/api/v1/conversations", { status: filter === "all" ? undefined : filter });
  const items = (state.data?.conversations ?? []).filter((c) => filter !== "all" || c.status !== "closed");

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ padding: space.lg, paddingBottom: space.sm }}>
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "Open" },
            { value: "escalated", label: "Needs you" },
            { value: "closed", label: "Closed" },
          ]}
        />
      </View>
      {state.loading && !state.data ? (
        <Loading />
      ) : (
        <Screen
          refreshing={state.refreshing}
          onRefresh={() => {
            state.refresh();
            void refreshCounts();
          }}
          contentStyle={{ paddingTop: space.sm }}
        >
          {state.error ? <ErrorBox message={state.error} onRetry={state.reload} /> : null}
          {items.length === 0 && !state.error ? (
            <Empty
              title={filter === "escalated" ? "No one is waiting" : "No conversations yet"}
              body={filter === "escalated" ? "When your assistant hands a customer to you, they show up here." : "Customer chats from WhatsApp, Telegram and your booking page appear here."}
            />
          ) : (
            <RowList>
              {items.map((c) => {
                const name = c.customer?.name ?? "Visitor";
                const preview = c.lastMessage ? `${c.lastRole === "agent" ? "Assistant: " : c.lastRole === "owner" ? "You: " : ""}${c.lastMessage}` : "No messages";
                return (
                  <Row
                    key={c.id}
                    onPress={() => router.push({ pathname: "/conversation/[id]", params: { id: c.id } })}
                    left={<Avatar name={name} />}
                    title={
                      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                        <T v="heading" numberOfLines={1} style={{ flexShrink: 1 }}>{name}</T>
                        <T v="caption" faint>{CHANNEL_LABEL[c.channel]}</T>
                      </View>
                    }
                    subtitle={
                      <View style={{ gap: 4 }}>
                        <T v="caption" muted numberOfLines={2}>{preview}</T>
                        {c.status === "escalated" ? (
                          <Pill label={c.escalationReason ? `Needs you · ${c.escalationReason}` : "Needs you"} tone="danger" />
                        ) : c.humanTakeover ? (
                          <Pill label="You're handling this" tone="info" />
                        ) : null}
                      </View>
                    }
                    right={<T v="caption" faint>{relativeTime(c.lastMessageAt)}</T>}
                    chevron={false}
                  />
                );
              })}
            </RowList>
          )}
        </Screen>
      )}
    </View>
  );
}
