import "server-only";
import { and, eq, gt } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db, schema } from "@/db";
import { randomToken, sha256 } from "./crypto";
import { newId } from "./ids";
import { forbidden, unauthorized } from "./errors";
import { isPlatformRole, platformCan, type PlatformPermission, type PlatformRole } from "./platform-rbac";

export const SESSION_COOKIE = "bks_session";
const WEB_TTL_DAYS = 30;
const MOBILE_TTL_DAYS = 90;

export type SessionUser = Pick<schema.User, "id" | "email" | "name" | "platformRole"> & {
  /** Set when a platform admin is signed in as this user. */
  impersonatorId?: string | null;
};

export const ADMIN_RETURN_COOKIE = "bks_admin_return";

export async function createSession(userId: string, kind: "web" | "mobile", opts: { impersonatorId?: string; ttlHours?: number } = {}) {
  const token = randomToken();
  const ttl = kind === "web" ? WEB_TTL_DAYS : MOBILE_TTL_DAYS;
  const expiresAt = new Date(Date.now() + (opts.ttlHours ? opts.ttlHours * 3600_000 : ttl * 86400_000));
  await db.insert(schema.sessions).values({ id: newId("ses"), tokenHash: sha256(token), userId, kind, expiresAt, impersonatorId: opts.impersonatorId ?? null });
  return { token, expiresAt };
}

export async function userFromToken(token: string | undefined | null): Promise<SessionUser | null> {
  if (!token) return null;
  const rows = await db
    .select({ id: schema.users.id, email: schema.users.email, name: schema.users.name, platformRole: schema.users.platformRole, disabled: schema.users.disabled, impersonatorId: schema.sessions.impersonatorId })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(and(eq(schema.sessions.tokenHash, sha256(token)), gt(schema.sessions.expiresAt, new Date())))
    .limit(1);
  const u = rows[0];
  if (!u || u.disabled) return null;
  // While impersonating, the session carries the user's identity but never platform staff powers.
  return { id: u.id, email: u.email, name: u.name, platformRole: u.impersonatorId ? null : u.platformRole, impersonatorId: u.impersonatorId };
}

export async function revokeToken(token: string) {
  await db.delete(schema.sessions).where(eq(schema.sessions.tokenHash, sha256(token)));
}

/** Web: current user from the session cookie (memoized per request). */
export const currentUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  return userFromToken(jar.get(SESSION_COOKIE)?.value);
});

export async function requireUser(next?: string): Promise<SessionUser> {
  const u = await currentUser();
  if (!u) redirect(`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  return u;
}

/** Any platform staff member (used by the /admin layout). */
export async function requireAdmin(): Promise<SessionUser> {
  const u = await requireUser("/admin");
  if (!isPlatformRole(u.platformRole)) redirect("/app");
  return u;
}

/** Platform staff with a specific permission: pages redirect, server actions should use assertPlatform. */
export async function requirePlatform(p: PlatformPermission): Promise<SessionUser & { platformRole: PlatformRole }> {
  const u = await requireAdmin();
  if (!platformCan(u.platformRole, p)) redirect("/admin?denied=1");
  return u as SessionUser & { platformRole: PlatformRole };
}

/** For server actions: throws instead of redirecting. */
export async function assertPlatform(p: PlatformPermission): Promise<SessionUser & { platformRole: PlatformRole }> {
  const u = await currentUser();
  if (!u) throw unauthorized();
  if (!platformCan(u.platformRole, p)) throw forbidden("You don't have access to this");
  return u as SessionUser & { platformRole: PlatformRole };
}

/** API: user from `Authorization: Bearer` (mobile) or the session cookie (web fetches). */
export async function userFromRequest(req: Request): Promise<SessionUser> {
  const auth = req.headers.get("authorization");
  const bearer = auth?.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : null;
  let token = bearer;
  if (!token) {
    const m = /(?:^|;\s*)bks_session=([^;]+)/.exec(req.headers.get("cookie") ?? "");
    token = m ? decodeURIComponent(m[1]) : null;
  }
  const u = await userFromToken(token);
  if (!u) throw unauthorized();
  return u;
}

export function assertAdmin(u: SessionUser, p: PlatformPermission = "settings.manage") {
  if (!platformCan(u.platformRole, p)) throw forbidden("Platform staff only");
}
