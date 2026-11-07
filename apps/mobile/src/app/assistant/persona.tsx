import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Button, Card, ErrorBox, Field, Gate, Screen, Section, Segmented, T, ToggleRow } from "../../components/ui";
import { api } from "../../lib/api";
import { useApi, useMutation } from "../../lib/hooks";
import { radius, space, useTheme } from "../../lib/theme";
import type { AgentView, Persona, Tone } from "../../lib/types";

const TONES: { value: Tone; label: string; hint: string }[] = [
  { value: "warm", label: "Warm", hint: "Friendly and reassuring" },
  { value: "professional", label: "Professional", hint: "Clear and courteous" },
  { value: "playful", label: "Playful", hint: "Upbeat, light touch" },
  { value: "luxury", label: "Luxury", hint: "Refined concierge" },
  { value: "concise", label: "Concise", hint: "Short and efficient" },
];

export default function PersonaScreen() {
  const t = useTheme();
  const state = useApi<AgentView>("/api/v1/agent");
  const mutation = useMutation();
  const [name, setName] = useState("");
  const [persona, setPersona] = useState<Persona | null>(null);
  const [instructions, setInstructions] = useState("");
  const [keywords, setKeywords] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const a = state.data?.agent;
    if (!a || persona) return;
    setName(a.name);
    setPersona(a.persona);
    setInstructions(a.instructions);
    setKeywords(a.escalationKeywords);
  }, [state.data, persona]);

  const set = <K extends keyof Persona>(k: K, v: Persona[K]) => {
    setSaved(false);
    setPersona((p) => (p ? { ...p, [k]: v } : p));
  };

  const save = () =>
    mutation.run(async () => {
      if (!persona) return;
      await api("/api/v1/agent", { method: "PATCH", body: { name: name.trim(), persona, instructions, escalationKeywords: keywords } });
      setSaved(true);
      setTimeout(() => router.back(), 400);
    });

  return (
    <Gate state={state}>
      {() =>
        !persona ? null : (
          <Screen>
            <Section title="Identity">
              <Card style={{ gap: space.md }}>
                <Field label="Assistant name" value={name} onChangeText={setName} maxLength={60} />
                <Field label="Default language" value={persona.language} onChangeText={(v) => set("language", v)} autoCapitalize="none" maxLength={10} hint="ISO code, e.g. en, fr, es. It mirrors the customer's language when it can." />
              </Card>
            </Section>

            <Section title="Tone">
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {TONES.map((o) => {
                  const on = persona.tone === o.value;
                  return (
                    <Pressable
                      key={o.value}
                      onPress={() => set("tone", o.value)}
                      style={{ width: "48%", flexGrow: 1, padding: space.md, borderRadius: radius.md, borderWidth: on ? 1.5 : 0.5, borderColor: on ? t.text : t.border, backgroundColor: t.surface, gap: 2 }}
                    >
                      <Text style={{ color: t.text, fontWeight: "600", fontSize: 15 }}>{o.label}</Text>
                      <Text style={{ color: t.textMuted, fontSize: 12 }}>{o.hint}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Segmented
                value={persona.formality}
                onChange={(v) => set("formality", v)}
                options={[
                  { value: "casual", label: "Casual" },
                  { value: "neutral", label: "Neutral" },
                  { value: "formal", label: "Formal" },
                ]}
              />
              <Card padded={false}>
                <ToggleRow label="Use emoji" hint="A few, tastefully" value={persona.emoji} onChange={(v) => set("emoji", v)} />
              </Card>
            </Section>

            <Section title="Words">
              <Card style={{ gap: space.md }}>
                <Field label="Greeting" value={persona.greeting} onChangeText={(v) => set("greeting", v)} multiline maxLength={300} placeholder="Hi! I'm the assistant at … How can I help?" />
                <Field label="Sign-off for confirmations" value={persona.signature} onChangeText={(v) => set("signature", v)} maxLength={120} placeholder="See you soon!" />
              </Card>
            </Section>

            <Section title="Your instructions">
              <Card style={{ gap: space.md }}>
                <Field
                  value={instructions}
                  onChangeText={(v) => {
                    setSaved(false);
                    setInstructions(v);
                  }}
                  multiline
                  maxLength={8000}
                  style={{ minHeight: 180 }}
                  placeholder={"House rules, e.g.\n• Always suggest a deep-conditioning add-on for colour services.\n• Never promise same-day appointments on Saturdays."}
                />
                <Field
                  label="Escalation keywords"
                  value={keywords}
                  onChangeText={(v) => {
                    setSaved(false);
                    setKeywords(v);
                  }}
                  hint="Comma-separated. If a customer mentions one, the conversation goes straight to you."
                />
              </Card>
              <T v="caption" faint>{instructions.length}/8000</T>
            </Section>

            {mutation.error ? <ErrorBox message={mutation.error} /> : null}
            <Button title={saved ? "Saved ✓" : "Save changes"} onPress={save} busy={mutation.busy} disabled={!name.trim()} />
          </Screen>
        )
      }
    </Gate>
  );
}
