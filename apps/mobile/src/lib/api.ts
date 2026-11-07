import { API_URL } from "./config";

/** Problem details returned by the API (RFC 9457), plus network failures mapped to the same shape. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fieldErrors?: Record<string, string[] | undefined>,
  ) {
    super(message);
  }
}

type Session = { token: string | null; businessId: string | null; onUnauthorized?: () => void };
const session: Session = { token: null, businessId: null };

export function configureSession(s: Partial<Session>) {
  Object.assign(session, s);
}

type Options = { method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"; body?: unknown; query?: Record<string, string | undefined | null>; signal?: AbortSignal };

export async function api<T>(path: string, opts: Options = {}): Promise<T> {
  const qs = opts.query
    ? Object.entries(opts.query)
        .filter(([, v]) => v != null && v !== "")
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join("&")
    : "";
  const url = `${API_URL}${path}${qs ? `?${qs}` : ""}`;
  const headers: Record<string, string> = { accept: "application/json" };
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  if (session.token) headers.authorization = `Bearer ${session.token}`;
  if (session.businessId) headers["x-business-id"] = session.businessId;

  let res: Response;
  try {
    res = await fetch(url, { method: opts.method ?? "GET", headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body), signal: opts.signal });
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw e;
    throw new ApiError(0, "network", "Can't reach the server. Check your connection.");
  }
  const text = await res.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    if (res.status === 401 && session.token) session.onUnauthorized?.();
    throw new ApiError(res.status, data?.code ?? "http_error", data?.detail ?? `Request failed (${res.status})`, data?.errors);
  }
  return data as T;
}

export const errorMessage = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong");
