import { router } from "expo-router";
import { Avatar, Pill, Row, RowList, Screen, T } from "../components/ui";
import { useSession } from "../lib/session";

export default function SwitchBusiness() {
  const { businesses, business, selectBusiness } = useSession();
  return (
    <Screen>
      <T v="body" muted>Choose which business to manage on this device.</T>
      <RowList>
        {businesses.map((b) => (
          <Row
            key={b.id}
            left={<Avatar name={b.name} color={b.brandColor} />}
            title={b.name}
            subtitle={`${b.role}${b.tier === "vip" ? " · VIP" : ""}`}
            right={b.id === business?.id ? <Pill label="Current" tone="positive" /> : undefined}
            chevron={false}
            onPress={async () => {
              await selectBusiness(b.id);
              router.back();
            }}
          />
        ))}
      </RowList>
    </Screen>
  );
}
