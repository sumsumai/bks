import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Button, Card, Divider, ErrorBox, Field, Gate, Screen, Section, ToggleRow } from "../../components/ui";
import { api } from "../../lib/api";
import { useApi, useMutation } from "../../lib/hooks";
import { space } from "../../lib/theme";
import type { Business, Policy } from "../../lib/types";

type NumKey = "minNoticeMinutes" | "maxAdvanceDays" | "cancellationWindowHours" | "slotIntervalMinutes";
const LIMITS: Record<NumKey, [number, number]> = {
  minNoticeMinutes: [0, 10080],
  maxAdvanceDays: [1, 365],
  cancellationWindowHours: [0, 336],
  slotIntervalMinutes: [5, 120],
};

export default function Policies() {
  const state = useApi<{ business: Business }>("/api/v1/business");
  const mutation = useMutation();
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [nums, setNums] = useState<Record<NumKey, string> | null>(null);

  useEffect(() => {
    const p = state.data?.business.policy;
    if (p && !policy) {
      setPolicy(p);
      setNums({ minNoticeMinutes: String(p.minNoticeMinutes), maxAdvanceDays: String(p.maxAdvanceDays), cancellationWindowHours: String(p.cancellationWindowHours), slotIntervalMinutes: String(p.slotIntervalMinutes) });
    }
  }, [state.data, policy]);

  const save = () =>
    mutation.run(async () => {
      if (!policy || !nums) return;
      const parsed = { ...policy };
      for (const k of Object.keys(LIMITS) as NumKey[]) {
        const n = Number(nums[k]);
        const [min, max] = LIMITS[k];
        if (!Number.isInteger(n) || n < min || n > max) throw new Error(`Enter a whole number between ${min} and ${max}.`);
        parsed[k] = n;
      }
      await api("/api/v1/business", { method: "PATCH", body: { policy: parsed } });
      router.back();
    });

  return (
    <Gate state={state}>
      {() =>
        !policy || !nums ? null : (
          <Screen>
            <Section title="Booking window">
              <Card style={{ gap: space.md }}>
                <Field label="Minimum notice (minutes)" value={nums.minNoticeMinutes} onChangeText={(v) => setNums({ ...nums, minNoticeMinutes: v })} keyboardType="number-pad" hint="How soon customers can book. 120 = two hours." />
                <Field label="Book up to (days ahead)" value={nums.maxAdvanceDays} onChangeText={(v) => setNums({ ...nums, maxAdvanceDays: v })} keyboardType="number-pad" />
                <Field label="Slot interval (minutes)" value={nums.slotIntervalMinutes} onChangeText={(v) => setNums({ ...nums, slotIntervalMinutes: v })} keyboardType="number-pad" />
                <Field label="Self-service changes until (hours before)" value={nums.cancellationWindowHours} onChangeText={(v) => setNums({ ...nums, cancellationWindowHours: v })} keyboardType="number-pad" hint="After this, customers must contact you to cancel or reschedule." />
              </Card>
            </Section>
            <Section title="Confirmation">
              <Card padded={false}>
                <ToggleRow label="Confirm bookings automatically" hint="Off: online and assistant bookings arrive as requests you confirm." value={policy.autoConfirm} onChange={(v) => setPolicy({ ...policy, autoConfirm: v })} />
                <Divider />
                <ToggleRow label="Require online payment" hint="Only applies when payments are set up on the web." value={policy.requirePayment} onChange={(v) => setPolicy({ ...policy, requirePayment: v })} />
              </Card>
            </Section>
            <Section title="Policy text">
              <Field value={policy.policyText} onChangeText={(v) => setPolicy({ ...policy, policyText: v })} multiline maxLength={2000} placeholder="Late arrivals, deposits, children, pets…" hint="Shown on your booking page and used by your assistant." />
            </Section>
            {mutation.error ? <ErrorBox message={mutation.error} /> : null}
            <Button title="Save policies" onPress={save} busy={mutation.busy} />
          </Screen>
        )
      }
    </Gate>
  );
}
