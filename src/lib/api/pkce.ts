/**
 * PKCE (Proof Key for Code Exchange) helpers.
 *
 * Email links and Google sign-in return a one-time `code` instead of tokens in
 * the URL. Only the browser that started the flow holds the matching
 * verifier, so a leaked link cannot be used to take over an account.
 */
const STORAGE_KEY = "sangam.pkce_verifier";

function base64Url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function createVerifier(): string {
  const bytes = new Uint8Array(48);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

export async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

/** Creates and stores a fresh verifier; returns the challenge to send. */
export async function startPkce(storage: Storage = localStorage): Promise<string> {
  const verifier = createVerifier();
  storage.setItem(STORAGE_KEY, verifier);
  return challengeFor(verifier);
}

export function takeVerifier(storage: Storage = localStorage): string | null {
  const v = storage.getItem(STORAGE_KEY);
  storage.removeItem(STORAGE_KEY);
  return v;
}
