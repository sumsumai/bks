import "server-only";
import { z, ZodError } from "zod";
import { AppError } from "./errors";
import { userFromRequest, type SessionUser } from "./auth";
import { tenantFromRequest, type Tenant } from "./tenant";
import type { Permission } from "./rbac";

type Params = Record<string, string>;
type Ctx = { params: Promise<Params> };

/** RFC 9457 problem response. */
export function problem(status: number, code: string, detail: string, extra?: unknown) {
  return Response.json({ type: "about:blank", status, code, detail, ...(extra ? { errors: extra } : {}) }, { status, headers: { "content-type": "application/problem+json" } });
}

function toResponse(e: unknown) {
  if (e instanceof AppError) return problem(e.status, e.code, e.message, e.details);
  if (e instanceof ZodError) return problem(422, "validation_failed", "Some fields are invalid", z.flattenError(e).fieldErrors);
  if (e instanceof SyntaxError) return problem(400, "bad_json", "Request body is not valid JSON");
  console.error("[api]", e);
  return problem(500, "internal", "Something went wrong");
}

const out = (data: unknown, status = 200) => (data instanceof Response ? data : Response.json(data ?? { ok: true }, { status }));

/** Public endpoint. */
export function publicRoute(fn: (req: Request, params: Params) => Promise<unknown>) {
  return async (req: Request, ctx: Ctx) => {
    try {
      return out(await fn(req, await ctx.params));
    } catch (e) {
      return toResponse(e);
    }
  };
}

/** Signed-in endpoint (cookie or bearer). */
export function userRoute(fn: (req: Request, user: SessionUser, params: Params) => Promise<unknown>) {
  return async (req: Request, ctx: Ctx) => {
    try {
      const user = await userFromRequest(req);
      return out(await fn(req, user, await ctx.params));
    } catch (e) {
      return toResponse(e);
    }
  };
}

/** Tenant endpoint: resolves the business from X-Business-Id and checks the caller's permission. */
export function tenantRoute(permission: Permission, fn: (req: Request, t: Tenant, params: Params) => Promise<unknown>) {
  return async (req: Request, ctx: Ctx) => {
    try {
      const user = await userFromRequest(req);
      const t = await tenantFromRequest(req, user, permission);
      return out(await fn(req, t, await ctx.params));
    } catch (e) {
      return toResponse(e);
    }
  };
}

export async function body<S extends z.ZodType>(req: Request, schema: S): Promise<z.infer<S>> {
  const json = await req.json();
  return schema.parse(json);
}

export const query = (req: Request) => new URL(req.url).searchParams;
