/**
 * Thin, typed wrapper around fetch for the Supabase REST and Auth APIs.
 * Every failure becomes an ApiError with a stable `code`, so screens can
 * show a translated message instead of a raw server string.
 */
import { config } from "@/config";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  accessToken?: string | null;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  timeoutMs?: number;
};

/** Normalises the different error shapes returned by GoTrue and PostgREST. */
export function toApiError(status: number, payload: unknown): ApiError {
  const p = (payload ?? {}) as Record<string, unknown>;
  const code = String(p.error_code ?? p.code ?? p.error ?? (status === 0 ? "network_error" : `http_${status}`));
  const message = String(p.msg ?? p.message ?? p.error_description ?? p.hint ?? "Request failed");
  return new ApiError(status, code, message, payload);
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    apikey: config.supabaseKey,
    Accept: "application/json",
    ...opts.headers,
  };
  // Publishable keys are not JWTs: only send Authorization for a signed-in user.
  if (opts.accessToken) headers.Authorization = `Bearer ${opts.accessToken}`;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 20_000);
  opts.signal?.addEventListener("abort", () => controller.abort(), { once: true });

  let res: Response;
  try {
    res = await fetch(`${config.supabaseUrl}${path}`, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: controller.signal,
    });
  } catch (e) {
    const aborted = (e as Error).name === "AbortError";
    throw new ApiError(0, aborted ? "timeout" : "network_error", (e as Error).message);
  } finally {
    clearTimeout(timeout);
  }

  const text = await res.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { message: text };
    }
  }
  if (!res.ok) throw toApiError(res.status, payload);
  return payload as T;
}
