// Gateway -> web app events. The web app owns all business logic (agent, inbox, customers); the
// gateway is only the WhatsApp transport.

export type GatewayEvent =
  | { type: "qr"; qr: string }
  | { type: "pairing_code"; code: string; phone: string }
  | { type: "connected"; phone: string; name: string }
  | { type: "disconnected"; reason: "logged_out" | "forbidden" | "pairing_expired" }
  | { type: "error"; message: string }
  | { type: "message"; thread: string; id: string; text: string; name: string; at: string }
  | { type: "echo"; thread: string; id: string; text: string; at: string }
  | { type: "history"; threads: { thread: string; name: string; messages: { id: string; fromMe: boolean; text: string; at: string }[] }[] };

const WEB_URL = (process.env.WEB_URL ?? "http://localhost:3200").replace(/\/$/, "");

export async function emit(businessId: string, event: GatewayEvent) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(`${WEB_URL}/api/internal/whatsapp`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${process.env.WA_GATEWAY_SECRET}` },
        body: JSON.stringify({ businessId, event }),
      });
      if (res.ok) return;
      if (res.status < 500) {
        console.error(`[emit] ${event.type} rejected: ${res.status} ${await res.text()}`);
        return;
      }
    } catch (e) {
      if (attempt === 3) console.error(`[emit] ${event.type} failed`, e);
    }
    await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
  }
}
