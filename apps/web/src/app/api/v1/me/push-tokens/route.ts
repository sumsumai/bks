import { z } from "zod";
import { db, schema } from "@/db";
import { body, userRoute } from "@/lib/api";
import { newId } from "@/lib/ids";

const Body = z.object({ token: z.string().min(10).max(300), platform: z.enum(["ios", "android", "web"]) });

export const POST = userRoute(async (req, user) => {
  const { token, platform } = await body(req, Body);
  await db
    .insert(schema.pushTokens)
    .values({ id: newId("psh"), userId: user.id, token, platform })
    .onConflictDoUpdate({ target: schema.pushTokens.token, set: { userId: user.id, platform } });
  return { ok: true };
});
