/**
 * A small, dependency-free client router built on the History API.
 * Routes are matched in order; `:name` segments become params.
 */
import { createContext, useContext, useEffect, useMemo, useState, type AnchorHTMLAttributes, type ReactNode } from "react";

export type Params = Record<string, string>;

export function matchPath(pattern: string, path: string): Params | null {
  const clean = (s: string) => s.replace(/\/+$/, "") || "/";
  const p = clean(pattern).split("/");
  const a = clean(path).split("/");
  if (p.length !== a.length) return null;
  const params: Params = {};
  for (let i = 0; i < p.length; i++) {
    const seg = p[i]!;
    if (seg.startsWith(":")) params[seg.slice(1)] = decodeURIComponent(a[i]!);
    else if (seg !== a[i]) return null;
  }
  return params;
}

/** Only same-site paths may be used as a post-login destination (prevents open redirects). */
export function safeNext(next: string | null | undefined, fallback = "/"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  return next;
}

type Location = { path: string; search: URLSearchParams; hash: string };
const RouterContext = createContext<Location | null>(null);

const readLocation = (): Location => ({
  path: window.location.pathname,
  search: new URLSearchParams(window.location.search),
  hash: window.location.hash,
});

export function navigate(to: string, { replace = false } = {}) {
  if (replace) history.replaceState(null, "", to);
  else history.pushState(null, "", to);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo({ top: 0 });
}

export function RouterProvider({ children }: { children: ReactNode }) {
  const [loc, setLoc] = useState<Location>(readLocation);
  useEffect(() => {
    const onPop = () => setLoc(readLocation());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  return <RouterContext.Provider value={loc}>{children}</RouterContext.Provider>;
}

export function useLocation(): Location {
  const ctx = useContext(RouterContext);
  if (!ctx) throw new Error("useLocation must be used inside RouterProvider");
  return ctx;
}

export type Route = { path: string; render: (params: Params) => ReactNode };

export function Routes({ routes, fallback }: { routes: Route[]; fallback: ReactNode }) {
  const { path } = useLocation();
  return useMemo(() => {
    for (const r of routes) {
      const params = matchPath(r.path, path);
      if (params) return <>{r.render(params)}</>;
    }
    return <>{fallback}</>;
  }, [routes, path, fallback]);
}

export function Link({ to, replace, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string; replace?: boolean }) {
  return (
    <a
      {...rest}
      href={to}
      onClick={(e) => {
        rest.onClick?.(e);
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        navigate(to, { replace });
      }}
    />
  );
}

export function Redirect({ to }: { to: string }) {
  useEffect(() => navigate(to, { replace: true }), [to]);
  return null;
}
