/**
 * Minimal PostgREST and Storage helpers. Row-level security in the database
 * decides what each user may read or change; these helpers only shape requests.
 */
import { config } from "@/config";
import { ApiError, request } from "./http";

export function select<T>(table: string, query: string, accessToken?: string | null, signal?: AbortSignal) {
  return request<T[]>(`/rest/v1/${table}?${query}`, { accessToken, signal });
}

export async function selectOne<T>(table: string, query: string, accessToken?: string | null) {
  const rows = await select<T>(table, `${query}&limit=1`, accessToken);
  return rows[0] ?? null;
}

export async function insert<T>(table: string, values: Record<string, unknown>, accessToken: string, query = "") {
  const rows = await request<T[]>(`/rest/v1/${table}${query ? `?${query}` : ""}`, {
    method: "POST",
    accessToken,
    body: values,
    headers: { Prefer: "return=representation" },
  });
  return rows[0] ?? null;
}

/** Insert without reading the row back (for write-only tables such as enquiries). */
export function insertOnly(table: string, values: Record<string, unknown>, accessToken?: string | null) {
  return request<null>(`/rest/v1/${table}`, {
    method: "POST",
    accessToken,
    body: values,
    headers: { Prefer: "return=minimal" },
  });
}

/** Insert or update on the primary key. */
export function upsert(table: string, values: Record<string, unknown> | Record<string, unknown>[], accessToken: string) {
  return request<null>(`/rest/v1/${table}`, {
    method: "POST",
    accessToken,
    body: values,
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
  });
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

export function remove(table: string, filter: string, accessToken: string) {
  return request<null>(`/rest/v1/${table}?${filter}`, { method: "DELETE", accessToken, headers: { Prefer: "return=minimal" } });
}

export function rpc<T>(fn: string, args: Record<string, unknown>, accessToken?: string | null) {
  return request<T>(`/rest/v1/rpc/${fn}`, { method: "POST", accessToken, body: args });
}

/** Escapes a value for use inside a PostgREST filter such as name=ilike.*value* */
export function filterValue(v: string): string {
  return encodeURIComponent(v.replace(/[,()*%\\]/g, " ").trim());
}

/** Uploads a file to Supabase Storage and returns its public URL. */
export async function uploadPublicFile(bucket: string, path: string, file: Blob, accessToken: string): Promise<string> {
  const res = await fetch(`${config.supabaseUrl}/storage/v1/object/${bucket}/${path}`, {
    method: "POST",
    headers: {
      apikey: config.supabaseKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": file.type || "application/octet-stream",
      "x-upsert": "false",
      "cache-control": "max-age=31536000",
    },
    body: file,
  });
  if (!res.ok) {
    let msg = "Upload failed";
    try {
      msg = ((await res.json()) as { message?: string }).message ?? msg;
    } catch {
      /* keep default */
    }
    throw new ApiError(res.status, res.status === 413 ? "file_too_large" : "upload_failed", msg);
  }
  return publicFileUrl(bucket, path);
}

export function publicFileUrl(bucket: string, path: string): string {
  return `${config.supabaseUrl}/storage/v1/object/public/${bucket}/${path}`;
}
