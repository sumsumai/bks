import { sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { body, publicRoute } from "@/lib/api";
import { createSession, SESSION_COOKIE } from "@/lib/auth";
import { verifyPassword } from "@/lib/crypto";
import { AppError } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";

const Body = z.object({ email: z.email(), password: z.string().min(1), client: z.enum(["web", "mobile"]).default("web") });

export const POST = publicRoute(async (req) => {
  rateLimit(req, "login", 10, 60_000);
  const input = await body(req, Body);
  const [user] = await db.select().from(schema.users).where(sql`lower(${schema.users.email}) = ${input.email.toLowerCase()}`);
  if (!user || user.disabled || !(await verifyPassword(input.password, user.passwordHash))) throw new AppError(401, "invalid_credentials", "Email or password is incorrect");
  const { token, expiresAt } = await createSession(user.id, input.client);
  const res = Response.json({ token: input.client === "mobile" ? token : undefined, user: { id: user.id, email: user.email, name: user.name, platformRole: user.platformRole } });
  if (input.client === "web") res.headers.append("set-cookie", `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${expiresAt.toUTCString()}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
  return res;
});
