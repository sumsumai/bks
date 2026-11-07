import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { safeEqual } from "./crypto.js";
import { businessesToRestore } from "./db.js";
import { logoutSession, sendText, sendTyping, sessionStatus, startSession, stopSession } from "./sessions.js";

/**
 * BKS WhatsApp gateway: holds one linked-device session (Baileys) per business.
 * Internal API, called only by the web app with Authorization: Bearer $WA_GATEWAY_SECRET.
 *   GET  /health
 *   GET  /sessions
 *   POST /sessions/:businessId/start   { pairingPhone? }   -> QR or pairing code arrive as events
 *   POST /sessions/:businessId/stop
 *   POST /sessions/:businessId/logout
 *   POST /sessions/:businessId/send    { thread, text }
 *   POST /sessions/:businessId/typing  { thread }
 * Run exactly one instance: a WhatsApp session can only live in one process.
 */

const SECRET = process.env.WA_GATEWAY_SECRET;
if (!SECRET) throw new Error("WA_GATEWAY_SECRET is required");

async function json(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function reply(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://gateway");
    if (url.pathname === "/health") return reply(res, 200, { ok: true, sessions: sessionStatus().length });
    if (!safeEqual(req.headers.authorization ?? "", `Bearer ${SECRET}`)) return reply(res, 401, { error: "unauthorized" });
    if (req.method === "GET" && url.pathname === "/sessions") return reply(res, 200, { sessions: sessionStatus() });

    const m = /^\/sessions\/([\w-]+)\/(start|stop|logout|send|typing)$/.exec(url.pathname);
    if (!m || req.method !== "POST") return reply(res, 404, { error: "not_found" });
    const [, businessId, action] = m;
    const body = await json(req);
    switch (action) {
      case "start":
        return reply(res, 200, await startSession(businessId, { pairingPhone: body.pairingPhone }));
      case "stop":
        await stopSession(businessId);
        return reply(res, 200, { ok: true });
      case "logout":
        await logoutSession(businessId);
        return reply(res, 200, { ok: true });
      case "send":
        if (typeof body.thread !== "string" || typeof body.text !== "string") return reply(res, 400, { error: "thread and text required" });
        return reply(res, 200, await sendText(businessId, body.thread, body.text));
      case "typing":
        await sendTyping(businessId, String(body.thread)).catch(() => {});
        return reply(res, 200, { ok: true });
    }
  } catch (e) {
    const status = (e as { status?: number }).status ?? 500;
    if (status === 500) console.error(e);
    reply(res, status, { error: e instanceof Error ? e.message : String(e) });
  }
});

const port = Number(process.env.PORT ?? 3300);
const host = process.env.HOST ?? "127.0.0.1"; // keep it private; expose only on an internal network
server.listen(port, host, async () => {
  console.log(`[wa-gateway] listening on ${host}:${port}`);
  const ids = await businessesToRestore();
  for (const id of ids) await startSession(id).catch((e) => console.error(`[wa-gateway] restore ${id}`, e));
  if (ids.length) console.log(`[wa-gateway] restored ${ids.length} session(s)`);
});

for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => server.close(() => process.exit(0)));
