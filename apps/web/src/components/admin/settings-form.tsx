import { saveSettingsAction } from "@/actions/admin-platform";
import { SubmitButton, Toggle } from "../client";
import { Badge, Field, Input, Select } from "../ui";
import { ActionForm } from "../workspace/action-form";
import type { describeSettings } from "@/lib/settings";

type Row = Awaited<ReturnType<typeof describeSettings>>[number];

const SOURCE: Record<Row["source"], { label: string; tone: "ok" | "neutral" | "warn" }> = {
  database: { label: "Saved here", tone: "ok" },
  environment: { label: "From environment", tone: "neutral" },
  default: { label: "Default", tone: "neutral" },
};

/** A form for a set of platform settings; each input is named after its setting key. */
export function SettingsForm({ rows, submit = "Save" }: { rows: Row[]; submit?: string }) {
  return (
    <ActionForm action={saveSettingsAction} className="space-y-5">
      <input type="hidden" name="_keys" value={rows.map((r) => r.key).join(",")} />
      {rows.map((r) => (
        <div key={r.key}>
          {r.kind === "boolean" ? (
            <Toggle name={r.key} defaultChecked={Boolean(r.value)} label={r.label} description={r.help} />
          ) : (
            <Field
              label={
                <span className="flex items-center gap-2">
                  {r.label}
                  <Badge tone={SOURCE[r.source].tone}>{SOURCE[r.source].label}</Badge>
                </span>
              }
            >
              {r.kind === "select" ? (
                <Select name={r.key} defaultValue={String(r.value ?? "")}>
                  {r.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              ) : r.kind === "secret" ? (
                <Input name={r.key} type="password" autoComplete="off" placeholder={r.secretSet ? `Set ${r.secretHint ?? ""} · leave blank to keep` : "Not set"} />
              ) : (
                <Input name={r.key} type={r.kind === "number" ? "number" : "text"} min={r.min} max={r.max} defaultValue={r.value === null ? "" : String(r.value)} />
              )}
              {r.help && <p className="mt-1 text-[12px] text-faint">{r.help}</p>}
              {r.source === "database" && (
                <label className="mt-1.5 flex items-center gap-1.5 text-[12px] text-muted">
                  <input type="checkbox" name={`clear:${r.key}`} /> Reset to {r.kind === "secret" ? "environment value / unset" : "environment / default"}
                </label>
              )}
            </Field>
          )}
        </div>
      ))}
      <SubmitButton>{submit}</SubmitButton>
    </ActionForm>
  );
}
