import { after } from "next/server";
import { safeEqual } from "@/lib/crypto";
import { getSetting } from "@/lib/settings";
import { parseTelegramUpdate } from "@/lib/channels/telegram";
import { handleTelegramUpdate } from "@/lib/channels/telegram-router";

/**
 * Webhook of the shared platform bot. Telegram echoes TELEGRAM_WEBHOOK_SECRET in a header; anything
 * without it is dropped. We acknowledge immediately and route/answer after the response.
 */
export async function POST(req: Request) {
  const expected = await getSetting("telegram.webhookSecret");
  const secret = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!expected || !safeEqual(secret, expected)) return new Response("forbidden", { status: 403 });
  const update = parseTelegramUpdate(await req.json().catch(() => null));
  if (update) {
    after(async () => {
      try {
        await handleTelegramUpdate(update);
      } catch (e) {
        console.error("[telegram]", e);
      }
    });
  }
  return Response.json({ ok: true });
}
