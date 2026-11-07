import "server-only";
import { getSettings } from "../settings";

// WhatsApp: each business links ITS OWN WhatsApp Business app as a linked device (like WhatsApp Web),
// by QR code or pairing code. The sockets live in the separate WhatsApp gateway (apps/wa-gateway, Baileys);
// this module is the web app's client for it. The business keeps using WhatsApp on its phone as usual.

/** Gateway location and secret are infrastructure (env), shared with apps/wa-gateway. */
export const gatewayConfigured = () => Boolean(process.env.WA_GATEWAY_URL && process.env.WA_GATEWAY_SECRET);

/** Businesses may link WhatsApp: gateway configured and the platform switch (Admin → WhatsApp) on. */
export const whatsappAvailable = async () => gatewayConfigured() && Boolean((await getSettings())["whatsapp.enabled"]);

async function gw<T>(path: string, body?: unknown): Promise<T> {
  if (!gatewayConfigured()) throw new Error("WhatsApp gateway is not configured (WA_GATEWAY_URL / WA_GATEWAY_SECRET)");
  const res = await fetch(`${process.env.WA_GATEWAY_URL!.replace(/\/$/, "")}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { authorization: `Bearer ${process.env.WA_GATEWAY_SECRET}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error ?? `WhatsApp gateway ${res.status}`);
  return json;
}

export const waStartLink = (businessId: string, pairingPhone?: string) => gw<{ status: string }>(`/sessions/${businessId}/start`, { pairingPhone });
export const waLogout = (businessId: string) => gw<{ ok: true }>(`/sessions/${businessId}/logout`, {});
export const waSend = (businessId: string, thread: string, text: string) => gw<{ id?: string }>(`/sessions/${businessId}/send`, { thread, text });
export const waTyping = (businessId: string, thread: string) => gw<{ ok: true }>(`/sessions/${businessId}/typing`, { thread }).catch(() => null);
export const waHealth = () => gw<{ sessions: { businessId: string; status: string; phone?: string }[] }>(`/sessions`);
/** Restart a business's socket (keeps the link). */
export const waRestart = async (businessId: string) => {
  await gw(`/sessions/${businessId}/stop`, {});
  return gw<{ status: string }>(`/sessions/${businessId}/start`, {});
};

/** Customer-facing number for wa.me links. "lid:" threads have no public number. */
export const waPhoneOfThread = (thread: string) => (thread.startsWith("lid:") ? null : `+${thread}`);
