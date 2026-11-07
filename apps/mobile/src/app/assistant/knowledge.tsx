import { useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { Button, Card, Divider, Empty, ErrorBox, Field, Gate, Pill, Screen, Section, Segmented, T } from "../../components/ui";
import { api, errorMessage } from "../../lib/api";
import { useApi, useMutation } from "../../lib/hooks";
import { space } from "../../lib/theme";
import type { KnowledgeItem, KnowledgeKind } from "../../lib/types";

const KINDS: { value: KnowledgeKind; label: string }[] = [
  { value: "faq", label: "FAQ" },
  { value: "policy", label: "Policy" },
  { value: "document", label: "Doc" },
  { value: "note", label: "Note" },
];
const KIND_LABEL: Record<KnowledgeKind, string> = { faq: "FAQ", policy: "Policy", document: "Document", note: "Note" };

type Draft = { id: string | null; kind: KnowledgeKind; title: string; content: string };
const EMPTY: Draft = { id: null, kind: "faq", title: "", content: "" };

export default function Knowledge() {
  const state = useApi<{ items: KnowledgeItem[] }>("/api/v1/agent/knowledge");
  const mutation = useMutation();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const save = () =>
    mutation.run(async () => {
      if (!draft) return;
      const body = { kind: draft.kind, title: draft.title.trim(), content: draft.content.trim() };
      if (!body.title || !body.content) throw new Error("Add a title and some content");
      if (draft.id) await api(`/api/v1/agent/knowledge/${draft.id}`, { method: "PATCH", body });
      else await api("/api/v1/agent/knowledge", { method: "POST", body });
      setDraft(null);
      state.reload();
    });

  const remove = (item: KnowledgeItem) =>
    Alert.alert("Delete this entry?", `“${item.title}” will no longer be used by your assistant.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setDeleteError(null);
          try {
            await api(`/api/v1/agent/knowledge/${item.id}`, { method: "DELETE" });
            state.setData((d) => (d ? { items: d.items.filter((x) => x.id !== item.id) } : d));
          } catch (e) {
            setDeleteError(errorMessage(e));
          }
        },
      },
    ]);

  return (
    <Gate state={state}>
      {({ items }) => (
        <Screen refreshing={state.refreshing} onRefresh={state.refresh}>
          <T v="body" muted>
            Your assistant already knows your services, prices, team, hours and booking policy. Add anything else customers ask about.
          </T>

          {draft ? (
            <Card style={{ gap: space.md }}>
              <T v="heading">{draft.id ? "Edit entry" : "New entry"}</T>
              <Segmented value={draft.kind} options={KINDS} onChange={(kind) => setDraft({ ...draft, kind })} />
              <Field label={draft.kind === "faq" ? "Question" : "Title"} value={draft.title} onChangeText={(title) => setDraft({ ...draft, title })} maxLength={200} placeholder={draft.kind === "faq" ? "Do you have parking?" : "Late arrival policy"} />
              <Field label={draft.kind === "faq" ? "Answer" : "Content"} value={draft.content} onChangeText={(content) => setDraft({ ...draft, content })} multiline style={{ minHeight: 140 }} placeholder="Write it the way you'd explain it to a new team member." />
              {mutation.error ? <ErrorBox message={mutation.error} /> : null}
              <View style={{ flexDirection: "row", gap: space.sm }}>
                <Button title="Cancel" variant="secondary" onPress={() => setDraft(null)} style={{ flex: 1 }} />
                <Button title="Save" onPress={save} busy={mutation.busy} style={{ flex: 1 }} />
              </View>
            </Card>
          ) : (
            <Button title="+ Add knowledge" onPress={() => setDraft(EMPTY)} />
          )}

          {deleteError ? <ErrorBox message={deleteError} /> : null}

          {items.length === 0 ? (
            <Empty title="Nothing here yet" body="Start with the three questions customers ask you most." />
          ) : (
            <Section title={`${items.length} entr${items.length === 1 ? "y" : "ies"}`}>
              <Card padded={false}>
                {items.map((item, i) => (
                  <View key={item.id}>
                    {i > 0 ? <Divider /> : null}
                    <Pressable onPress={() => setOpen(open === item.id ? null : item.id)} style={{ padding: space.lg, gap: space.sm }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                        <T v="heading" style={{ flex: 1 }} numberOfLines={open === item.id ? undefined : 1}>{item.title}</T>
                        <Pill label={KIND_LABEL[item.kind]} />
                      </View>
                      <T v="body" muted numberOfLines={open === item.id ? undefined : 2}>{item.content}</T>
                      {open === item.id ? (
                        <View style={{ flexDirection: "row", gap: space.sm, marginTop: space.xs }}>
                          <Button title="Edit" variant="secondary" small onPress={() => setDraft({ id: item.id, kind: item.kind, title: item.title, content: item.content })} />
                          <Button title="Delete" variant="danger" small onPress={() => remove(item)} />
                        </View>
                      ) : null}
                    </Pressable>
                  </View>
                ))}
              </Card>
            </Section>
          )}
        </Screen>
      )}
    </Gate>
  );
}
