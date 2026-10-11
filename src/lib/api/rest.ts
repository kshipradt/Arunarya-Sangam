/**
 * Minimal PostgREST helpers. Row-level security in the database decides what
 * each user may read or change; these helpers only shape requests.
 */
import { request } from "./http";

export function select<T>(table: string, query: string, accessToken?: string | null, signal?: AbortSignal) {
  return request<T[]>(`/rest/v1/${table}?${query}`, { accessToken, signal });
}

export async function selectOne<T>(table: string, query: string, accessToken?: string | null) {
  const rows = await select<T>(table, `${query}&limit=1`, accessToken);
  return rows[0] ?? null;
}

export async function update<T>(table: string, filter: string, values: Record<string, unknown>, accessToken: string) {
  const rows = await request<T[]>(`/rest/v1/${table}?${filter}`, {
    method: "PATCH",
    accessToken,
    body: values,
    headers: { Prefer: "return=representation" },
  });
  return rows[0] ?? null;
}

export function rpc<T>(fn: string, args: Record<string, unknown>, accessToken?: string | null) {
  return request<T>(`/rest/v1/rpc/${fn}`, { method: "POST", accessToken, body: args });
}

/** Escapes a value for use inside a PostgREST filter such as name=ilike.*value* */
export function filterValue(v: string): string {
  return encodeURIComponent(v.replace(/[,()*%\\]/g, " ").trim());
}
