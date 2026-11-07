import { router } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";
import { Empty, Gate, Row, RowList, Screen } from "../components/ui";
import { api } from "../lib/api";
import { relativeTime } from "../lib/format";
import { appRoute } from "../lib/links";
import { useApi } from "../lib/hooks";
import { useSession } from "../lib/session";
import { useTheme } from "../lib/theme";
import type { Counts, Notification } from "../lib/types";

export default function Notifications() {
  const t = useTheme();
  const { refreshCounts } = useSession();
  const state = useApi<{ notifications: Notification[]; counts: Counts }>("/api/v1/notifications");

  // Opening the list marks everything read.
  useEffect(() => {
    if (!state.data?.counts.notifications) return;
    api("/api/v1/notifications/read", { method: "POST" })
      .then(() => refreshCounts())
      .catch(() => {});
  }, [state.data, refreshCounts]);

  return (
    <Gate state={state}>
      {({ notifications }) => (
        <Screen refreshing={state.refreshing} onRefresh={state.refresh}>
          {notifications.length === 0 ? (
            <Empty title="No notifications" body="New bookings, approvals and customers who need you will show up here." />
          ) : (
            <RowList>
              {notifications.map((n) => {
                const route = appRoute(n.href);
                return (
                  <Row
                    key={n.id}
                    left={<View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: n.readAt ? "transparent" : t.danger }} />}
                    title={n.title}
                    subtitle={`${n.body ? `${n.body} · ` : ""}${relativeTime(n.createdAt)}`}
                    onPress={route ? () => router.push(route) : undefined}
                  />
                );
              })}
            </RowList>
          )}
        </Screen>
      )}
    </Gate>
  );
}
