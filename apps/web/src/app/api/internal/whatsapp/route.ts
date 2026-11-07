import { after } from "next/server";
import { safeEqual } from "@/lib/crypto";
import { getSetting } from "@/lib/settings";
import { handleGatewayEvent, type GatewayEvent } from "@/lib/channels/whatsapp-router";

/** Events from the WhatsApp gateway (apps/wa-gateway). Private: shared-secret auth, never exposed to browsers. */
export async function POST(req: Request) {
  const secret = await getSetting("whatsapp.gatewaySecret");
  if (!secret || !safeEqual(req.headers.get("authorization") ?? "", `Bearer ${secret}`)) return new Response("forbidden", { status: 403 });
  const body = (await req.json().catch(() => null)) as { businessId?: string; event?: GatewayEvent } | null;
  if (!body?.businessId || !body.event?.type) return new Response("bad request", { status: 400 });
  const { businessId, event } = body;
  // Linking state is applied synchronously so the UI sees the QR / code immediately; messages run after.
  if (["qr", "pairing_code", "connected", "disconnected", "error"].includes(event.type)) await handleGatewayEvent(businessId, event);
  else
    after(async () => {
      try {
        await handleGatewayEvent(businessId, event);
      } catch (e) {
        console.error("[whatsapp]", event.type, e);
      }
    });
  return Response.json({ ok: true });
}
