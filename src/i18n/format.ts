/**
 * Message formatting: {name} placeholders and <tag>…</tag> rich segments.
 * Kept free of React so it can be unit-tested directly.
 */
export type Vars = Record<string, string | number>;

export function interpolate(message: string, vars?: Vars): string {
  if (!vars) return message;
  return message.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

export type Segment = { tag: string | null; text: string };

/** Splits "I agree to the <terms>Terms</terms>." into plain and tagged segments. */
export function parseRich(message: string): Segment[] {
  const out: Segment[] = [];
  const re = /<(\w+)>(.*?)<\/\1>/gs;
  let last = 0;
  for (const m of message.matchAll(re)) {
    if (m.index! > last) out.push({ tag: null, text: message.slice(last, m.index) });
    out.push({ tag: m[1]!, text: m[2]! });
    last = m.index! + m[0].length;
  }
  if (last < message.length) out.push({ tag: null, text: message.slice(last) });
  return out;
}

export function placeholdersOf(message: string): string[] {
  return [...message.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();
}

export function tagsOf(message: string): string[] {
  return [...message.matchAll(/<(\w+)>/g)].map((m) => m[1]!).sort();
}
