import * as Notifications from "expo-notifications";
import { Stack, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef } from "react";
import { useColorScheme } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Loading } from "../components/ui";
import { appRoute } from "../lib/links";
import { SessionProvider, useSession } from "../lib/session";
import { useTheme } from "../lib/theme";

/** Tapping a push notification opens the matching screen (once a session and business are loaded). */
function usePushNavigation(enabled: boolean) {
  const response = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);
  const { business, selectBusiness, refreshCounts } = useSession();
  useEffect(() => {
    if (!enabled || !response) return;
    const id = response.notification.request.identifier;
    if (handled.current === id) return;
    handled.current = id;
    const data = response.notification.request.content.data as { href?: string; businessId?: string } | undefined;
    void (async () => {
      if (data?.businessId && business && data.businessId !== business.id) await selectBusiness(data.businessId).catch(() => {});
      void refreshCounts();
      const route = appRoute(data?.href);
      if (route) router.push(route);
    })();
  }, [enabled, response, business, selectBusiness, refreshCounts]);
}

function RootStack() {
  const { ready, token, business } = useSession();
  const t = useTheme();
  usePushNavigation(ready && !!token && !!business);
  if (!ready) return <Loading />;
  const signedIn = !!token;
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: t.bg },
        headerTintColor: t.text,
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: "600" },
        headerBackButtonDisplayMode: "minimal",
        contentStyle: { backgroundColor: t.bg },
      }}
    >
      <Stack.Protected guard={signedIn && !!business}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="booking/[id]" options={{ title: "Booking" }} />
        <Stack.Screen name="booking/new" options={{ title: "New booking", presentation: "modal" }} />
        <Stack.Screen name="conversation/[id]" options={{ title: "Conversation" }} />
        <Stack.Screen name="approvals" options={{ title: "Approvals" }} />
        <Stack.Screen name="assistant/persona" options={{ title: "Voice & instructions" }} />
        <Stack.Screen name="assistant/permissions" options={{ title: "Permissions" }} />
        <Stack.Screen name="assistant/knowledge" options={{ title: "Knowledge" }} />
        <Stack.Screen name="assistant/actions" options={{ title: "Activity log" }} />
        <Stack.Screen name="assistant/whatsapp" options={{ title: "WhatsApp" }} />
        <Stack.Screen name="settings/business" options={{ title: "Business info" }} />
        <Stack.Screen name="settings/policies" options={{ title: "Booking policies" }} />
        <Stack.Screen name="settings/services" options={{ title: "Services" }} />
        <Stack.Screen name="settings/service/[id]" options={{ title: "Service" }} />
        <Stack.Screen name="settings/staff" options={{ title: "Team & hours" }} />
        <Stack.Screen name="settings/staff/[id]" options={{ title: "Working hours" }} />
        <Stack.Screen name="notifications" options={{ title: "Notifications" }} />
        <Stack.Screen name="switch-business" options={{ title: "Switch business", presentation: "modal" }} />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !business}>
        <Stack.Screen name="no-business" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="login" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const scheme = useColorScheme();
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <StatusBar style={scheme === "dark" ? "light" : "dark"} />
        <RootStack />
      </SessionProvider>
    </SafeAreaProvider>
  );
}
