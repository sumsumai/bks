import { useState } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, ErrorBox, Field, T } from "../components/ui";
import { errorMessage } from "../lib/api";
import { API_URL } from "../lib/config";
import { useSession } from "../lib/session";
import { space, useTheme } from "../lib/theme";

export default function Login() {
  const t = useTheme();
  const { signIn } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!email.trim() || !password) return setError("Enter your email and password.");
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, justifyContent: "center", padding: space.xl, gap: space.xl }}>
        <View style={{ gap: space.sm }}>
          <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: t.accent, alignItems: "center", justifyContent: "center", marginBottom: space.md }}>
            <T v="title" color={t.accentText}>B</T>
          </View>
          <T v="display">Your business,{"\n"}in your pocket.</T>
          <T v="body" muted>Bookings, customers and your AI assistant. Sign in with your owner account.</T>
        </View>
        <View style={{ gap: space.md }}>
          <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" returnKeyType="next" />
          <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" textContentType="password" returnKeyType="go" onSubmitEditing={submit} />
          {error ? <ErrorBox message={error} /> : null}
          <Button title="Sign in" onPress={submit} busy={busy} />
        </View>
        <T v="caption" faint style={{ textAlign: "center" }}>
          New here? Create your business on the web first.{"\n"}Server: {API_URL}
        </T>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
