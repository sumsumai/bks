import { useEffect, useState } from "react";
import { Linking, View } from "react-native";
import { Button, Card, ErrorBox, Field, Gate, Pill, Screen, Section, T } from "../../components/ui";
import { api } from "../../lib/api";
import { useApi, useMutation } from "../../lib/hooks";
import { space } from "../../lib/theme";
import type { ChannelInfo } from "../../lib/types";

type Resp = { channel: ChannelInfo | null };

/**
 * Link the WhatsApp Business app on THIS phone as a device for the assistant. On the phone itself you
 * can't scan a QR code, so we use WhatsApp's "Link with phone number instead" pairing code.
 */
export default function WhatsAppScreen() {
  const state = useApi<Resp>("/api/v1/channels/whatsapp");
  const mutation = useMutation();
  const [phone, setPhone] = useState("");
  const status = state.data?.channel?.status;

  // Poll while linking.
  useEffect(() => {
    if (status !== "pairing") return;
    const t = setInterval(() => state.reload(), 2500);
    return () => clearInterval(t);
  }, [status, state]);

  return (
    <Gate state={state}>
      {({ channel }) => (
        <Screen refreshing={state.loading} onRefresh={state.reload}>
          {channel?.status === "connected" ? (
            <Section title="Linked">
              <Card>
                <View style={{ gap: space.sm }}>
                  <Pill label="Live" tone="positive" />
                  <T v="heading">{channel.displayName || "WhatsApp Business"}</T>
                  <T muted>Your assistant answers customers on your number. Keep using WhatsApp Business as usual: when you reply yourself, the assistant steps back for that customer.</T>
                  <Button
                    title="Unlink"
                    variant="danger"
                    busy={mutation.busy}
                    onPress={() => mutation.run(() => api<Resp>("/api/v1/channels/whatsapp", { method: "DELETE" })).then(() => state.reload())}
                  />
                </View>
              </Card>
            </Section>
          ) : channel?.status === "pairing" && channel.pairing?.code ? (
            <Section title="Enter this code in WhatsApp">
              <Card>
                <View style={{ alignItems: "center", gap: space.md }}>
                  <T v="display" style={{ letterSpacing: 6, fontVariant: ["tabular-nums"] }}>{`${channel.pairing.code.slice(0, 4)}-${channel.pairing.code.slice(4)}`}</T>
                  <T muted style={{ textAlign: "center" }}>
                    In WhatsApp Business: Settings → Linked devices → Link a device → “Link with phone number instead”, then type this code.
                  </T>
                  <Button title="Open WhatsApp Business" variant="secondary" onPress={() => Linking.openURL("whatsapp://").catch(() => {})} />
                  <T v="caption" faint>Waiting for WhatsApp…</T>
                </View>
              </Card>
            </Section>
          ) : (
            <Section title="Link your WhatsApp Business">
              <Card>
                <View style={{ gap: space.md }}>
                  <T muted>Your assistant joins your WhatsApp Business as a linked device, like WhatsApp Web. Your number, contacts and chats stay as they are, and you can unlink anytime.</T>
                  <Field label="Your WhatsApp Business number" placeholder="+33 6 12 34 56 78" keyboardType="phone-pad" value={phone} onChangeText={setPhone} autoComplete="tel" />
                  <Button
                    title={channel?.status === "pairing" ? "Getting your code…" : "Get linking code"}
                    busy={mutation.busy || channel?.status === "pairing"}
                    disabled={phone.replace(/\D/g, "").length < 8}
                    onPress={() => mutation.run(() => api<Resp>("/api/v1/channels/whatsapp", { method: "POST", body: { phone } })).then(() => state.reload())}
                  />
                  {mutation.error || channel?.lastError ? <ErrorBox message={(mutation.error ?? channel?.lastError)!} /> : null}
                  <T v="caption" faint>On a computer? Scan a QR code instead from Channels in the web workspace.</T>
                </View>
              </Card>
            </Section>
          )}
        </Screen>
      )}
    </Gate>
  );
}
