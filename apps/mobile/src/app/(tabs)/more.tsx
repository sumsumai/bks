import { router } from "expo-router";
import { Alert, View } from "react-native";
import { Avatar, Button, Card, Pill, Row, RowList, Screen, Section, T } from "../../components/ui";
import { API_URL } from "../../lib/config";
import { useSession } from "../../lib/session";
import { space } from "../../lib/theme";

export default function More() {
  const { user, business, businesses, counts, signOut } = useSession();
  if (!business) return null;
  const isOwner = business.role === "owner";
  const canCatalog = business.role !== "staff";

  return (
    <Screen>
      <Card style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
        <Avatar name={business.name} color={business.brandColor} size={48} />
        <View style={{ flex: 1, gap: 2 }}>
          <T v="heading">{business.name}</T>
          <T v="caption" muted>
            {user?.email} · {business.role}
          </T>
        </View>
        <Pill label={business.tier === "vip" ? "VIP" : "Standard"} tone={business.tier === "vip" ? "warning" : "neutral"} />
      </Card>
      {businesses.length > 1 ? <Button title="Switch business" variant="secondary" onPress={() => router.push("/switch-business")} /> : null}

      <Section title="Activity">
        <RowList>
          <Row
            title="Notifications"
            subtitle={counts.notifications ? `${counts.notifications} unread` : "You're all caught up"}
            right={counts.notifications ? <Pill label={String(counts.notifications)} tone="danger" /> : undefined}
            onPress={() => router.push("/notifications")}
          />
          {canCatalog ? <Row title="Approvals" subtitle="Actions your assistant asked you to confirm" onPress={() => router.push("/approvals")} /> : null}
        </RowList>
      </Section>

      <Section title="Business">
        <RowList>
          {isOwner ? <Row title="Business info" subtitle="Name, description, contact, visibility" onPress={() => router.push("/settings/business")} /> : null}
          {isOwner ? <Row title="Booking policies" subtitle="Notice, cancellation window, confirmations" onPress={() => router.push("/settings/policies")} /> : null}
          {canCatalog ? <Row title="Services" subtitle="Prices, durations, availability" onPress={() => router.push("/settings/services")} /> : null}
          {canCatalog ? <Row title="Team & hours" subtitle="Who works when" onPress={() => router.push("/settings/staff")} /> : null}
        </RowList>
        {!canCatalog ? <T v="caption" muted>Ask the owner or a manager to change services and hours.</T> : null}
      </Section>

      <Section title="Account">
        <RowList>
          <Row
            title="Sign out"
            onPress={() =>
              Alert.alert("Sign out?", "You'll stop receiving notifications on this device.", [
                { text: "Cancel", style: "cancel" },
                { text: "Sign out", style: "destructive", onPress: () => void signOut() },
              ])
            }
          />
        </RowList>
        <T v="caption" faint style={{ textAlign: "center", marginTop: space.md }}>
          BKS Business · {API_URL}
        </T>
      </Section>
    </Screen>
  );
}
