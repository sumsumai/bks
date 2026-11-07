import { Tabs } from "expo-router/js-tabs";
import { Text, type ColorValue } from "react-native";
import { useSession } from "../../lib/session";
import { useTheme } from "../../lib/theme";

const glyph = (g: string) =>
  function TabIcon({ color }: { color: ColorValue }) {
    return <Text style={{ color, fontSize: 20, lineHeight: 24 }}>{g}</Text>;
  };

export default function TabsLayout() {
  const t = useTheme();
  const { counts } = useSession();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: t.bg },
        headerTintColor: t.text,
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: "700", fontSize: 17 },
        tabBarActiveTintColor: t.text,
        tabBarInactiveTintColor: t.textFaint,
        tabBarStyle: { backgroundColor: t.surface, borderTopColor: t.border },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        tabBarBadgeStyle: { backgroundColor: t.danger, color: "#FFFFFF", fontSize: 10 },
        sceneStyle: { backgroundColor: t.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Today", tabBarIcon: glyph("◎") }} />
      <Tabs.Screen name="bookings" options={{ title: "Calendar", tabBarIcon: glyph("▦") }} />
      <Tabs.Screen name="inbox" options={{ title: "Inbox", tabBarIcon: glyph("✉"), tabBarBadge: counts.escalations || undefined }} />
      <Tabs.Screen name="agent" options={{ title: "Assistant", tabBarIcon: glyph("✦"), tabBarBadge: counts.approvals || undefined }} />
      <Tabs.Screen name="more" options={{ title: "More", tabBarIcon: glyph("☰"), tabBarBadge: counts.notifications ? "•" : undefined }} />
    </Tabs>
  );
}
