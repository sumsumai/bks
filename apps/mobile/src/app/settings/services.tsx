import { router } from "expo-router";
import { Empty, Gate, Pill, Row, RowList, Screen, T } from "../../components/ui";
import { fmtMoney } from "../../lib/format";
import { useApi } from "../../lib/hooks";
import { useBusiness } from "../../lib/session";
import type { Service } from "../../lib/types";

export default function Services() {
  const business = useBusiness();
  const state = useApi<{ services: Service[] }>("/api/v1/services");
  return (
    <Gate state={state}>
      {({ services }) => (
        <Screen refreshing={state.refreshing} onRefresh={state.refresh}>
          {services.length === 0 ? (
            <Empty title="No services yet" body="Create your first services in the web workspace; edit them here on the go." />
          ) : (
            <RowList>
              {services.map((s) => (
                <Row
                  key={s.id}
                  title={s.name}
                  subtitle={`${s.durationMinutes} min${s.bufferMinutes ? ` + ${s.bufferMinutes} buffer` : ""}`}
                  right={s.active ? <T v="heading">{fmtMoney(s.priceCents, business.currency)}</T> : <Pill label="Hidden" />}
                  onPress={() => router.push({ pathname: "/settings/service/[id]", params: { id: s.id } })}
                />
              ))}
            </RowList>
          )}
          <T v="caption" faint>Adding new services and assigning staff is done in the web workspace.</T>
        </Screen>
      )}
    </Gate>
  );
}
