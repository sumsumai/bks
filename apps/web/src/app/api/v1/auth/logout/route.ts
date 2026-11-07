import { publicRoute } from "@/lib/api";
import { revokeToken, SESSION_COOKIE } from "@/lib/auth";

export const POST = publicRoute(async (req) => {
  const auth = req.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : /(?:^|;\s*)bks_session=([^;]+)/.exec(req.headers.get("cookie") ?? "")?.[1];
  if (token) await revokeToken(decodeURIComponent(token));
  const res = Response.json({ ok: true });
  res.headers.append("set-cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; Max-Age=0`);
  return res;
});
