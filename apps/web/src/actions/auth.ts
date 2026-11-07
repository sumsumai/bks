"use server";

import { sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { db, schema } from "@/db";
import { createSession, revokeToken, SESSION_COOKIE } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/crypto";
import { newId } from "@/lib/ids";
import { rateLimit } from "@/lib/rate-limit";
import { isPlatformRole } from "@/lib/platform-rbac";
import { getSetting } from "@/lib/settings";
import { ACTIVE_BUSINESS_COOKIE } from "@/lib/tenant";

export type FormState = { error?: string; fieldErrors?: Record<string, string[] | undefined> } | null;

async function setSessionCookie(token: string, expiresAt: Date) {
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", expires: expiresAt });
}

async function limit(bucket: string, n: number) {
  const h = await headers();
  rateLimit(new Request("http://x", { headers: h }), bucket, n, 60_000);
}

const safeNext = (next: unknown) => (typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : null);

export async function login(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    await limit("login", 10);
  } catch {
    return { error: "Too many attempts. Wait a minute and try again." };
  }
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const [user] = await db.select().from(schema.users).where(sql`lower(${schema.users.email}) = ${email}`);
  if (!user || user.disabled || !(await verifyPassword(password, user.passwordHash))) return { error: "Email or password is incorrect." };
  const { token, expiresAt } = await createSession(user.id, "web");
  await setSessionCookie(token, expiresAt);
  redirect(safeNext(form.get("next")) ?? (isPlatformRole(user.platformRole) ? "/admin" : "/app"));
}

const Signup = z.object({ name: z.string().trim().min(1, "Required").max(80), email: z.email("Enter a valid email"), password: z.string().min(8, "At least 8 characters") });

export async function signup(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    await limit("signup", 5);
  } catch {
    return { error: "Too many attempts. Wait a minute and try again." };
  }
  if (!(await getSetting("general.signupsOpen"))) return { error: "New sign-ups are closed right now. Contact us to get an account." };
  const parsed = Signup.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const { name, email, password } = parsed.data;
  const [exists] = await db.select({ id: schema.users.id }).from(schema.users).where(sql`lower(${schema.users.email}) = ${email.toLowerCase()}`);
  if (exists) return { fieldErrors: { email: ["An account with this email already exists"] } };
  const [user] = await db.insert(schema.users).values({ id: newId("usr"), email: email.toLowerCase(), name, passwordHash: await hashPassword(password) }).returning();
  const { token, expiresAt } = await createSession(user.id, "web");
  await setSessionCookie(token, expiresAt);
  redirect("/app/onboarding");
}

export async function logout() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await revokeToken(token);
  jar.delete(SESSION_COOKIE);
  jar.delete(ACTIVE_BUSINESS_COOKIE);
  redirect("/");
}

export async function switchBusiness(form: FormData) {
  (await cookies()).set(ACTIVE_BUSINESS_COOKIE, String(form.get("businessId")), { path: "/", sameSite: "lax", httpOnly: true });
  redirect("/app");
}
