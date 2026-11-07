import { useState } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, ErrorBox, T } from "../components/ui";
import { errorMessage } from "../lib/api";
import { useSession } from "../lib/session";
import { space, useTheme } from "../lib/theme";

/** Signed in, but no business loaded: either the account has none yet, or the server was unreachable. */
export default function NoBusiness() {
  const t = useTheme();
  const { user, refreshMe, signOut } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const retry = async () => {
    setBusy(true);
    setError(null);
    try {
      await refreshMe();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg, justifyContent: "center", padding: space.xl, gap: space.lg }}>
      <T v="title">{user ? `Hi ${user.name.split(" ")[0]}` : "Almost there"}</T>
      <T v="body" muted>
        {user
          ? "This account isn't part of a business yet. Finish onboarding on the web, or ask the owner to invite you, then come back."
          : "We couldn't load your account. Check your connection and try again."}
      </T>
      {error ? <ErrorBox message={error} /> : null}
      <View style={{ gap: space.sm }}>
        <Button title="Try again" onPress={retry} busy={busy} />
        <Button title="Sign out" variant="ghost" onPress={signOut} />
      </View>
    </SafeAreaView>
  );
}
