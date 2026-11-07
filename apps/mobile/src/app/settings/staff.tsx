import { router } from "expo-router";
import { Avatar, Empty, Gate, Pill, Row, RowList, Screen, T } from "../../components/ui";
import { minutesToHHMM } from "../../lib/format";
import { useApi } from "../../lib/hooks";
import type { Hours, Staff } from "../../lib/types";

const SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function summarize(hours: Hours[]) {
  if (!hours.length) return "No working hours";
  const days = [...new Set(hours.map((h) => h.weekday))].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  const open = Math.min(...hours.map((h) => h.startMinute));
  const close = Math.max(...hours.map((h) => h.endMinute));
  return `${days.map((d) => SHORT[d]).join(", ")} · ${minutesToHHMM(open)}–${minutesToHHMM(close)}`;
}

export default function StaffList() {
  const state = useApi<{ staff: Staff[] }>("/api/v1/staff");
  return (
    <Gate state={state}>
      {({ staff }) => (
        <Screen refreshing={state.refreshing} onRefresh={state.refresh}>
          {staff.length === 0 ? (
            <Empty title="No team members" />
          ) : (
            <RowList>
              {staff.map((s) => (
                <Row
                  key={s.id}
                  left={<Avatar name={s.name} color={s.color} />}
                  title={s.name}
                  subtitle={summarize(s.hours)}
                  right={s.active ? undefined : <Pill label="Inactive" />}
                  onPress={() => router.push({ pathname: "/settings/staff/[id]", params: { id: s.id } })}
                />
              ))}
            </RowList>
          )}
          <T v="caption" faint>Hours are in your business's local time. Add team members in the web workspace.</T>
        </Screen>
      )}
    </Gate>
  );
}
