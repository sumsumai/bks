import { z } from "zod";
import { db, schema } from "@/db";
import { body, publicRoute } from "@/lib/api";
import { createSession, SESSION_COOKIE } from "@/lib/auth";
import { hashPassword } from "@/lib/crypto";
import { AppError, conflict } from "@/lib/errors";
import { getSetting } from "@/lib/settings";
import { newId } from "@/lib/ids";
import { rateLimit } from "@/lib/rate-limit";
import { sql } from "drizzle-orm";

const Body = z.object({ name: z.string().trim().min(1).max(80), email: z.email().max(200), password: z.string().min(8).max(200), client: z.enum(["web", "mobile"]).default("web") });

export const POST = publicRoute(async (req) => {
  rateLimit(req, "signup", 5, 60_000);
  if (!(await getSetting("general.signupsOpen"))) throw new AppError(403, "signups_closed", "New sign-ups are closed right now");
  const input = await body(req, Body);
  const [exists] = await db.select({ id: schema.users.id }).from(schema.users).where(sql`lower(${schema.users.email}) = ${input.email.toLowerCase()}`);
  if (exists) throw conflict("email_taken", "An account with this email already exists");
  const [user] = await db
    .insert(schema.users)
    .values({ id: newId("usr"), email: input.email.toLowerCase(), name: input.name, passwordHash: await hashPassword(input.password) })
    .returning({ id: schema.users.id, email: schema.users.email, name: schema.users.name });
  const { token, expiresAt } = await createSession(user.id, input.client);
  const res = Response.json({ token: input.client === "mobile" ? token : undefined, user }, { status: 201 });
  if (input.client === "web") res.headers.append("set-cookie", `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${expiresAt.toUTCString()}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
  return res;
});
