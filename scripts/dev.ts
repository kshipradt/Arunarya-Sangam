/**
 * Local development server: builds once, rebuilds on change, serves dist/
 * with single-page-app fallback on http://localhost:5173.
 */
import { watch } from "node:fs";
import { join, normalize } from "node:path";
import { build } from "./build";

process.env.NODE_ENV = "development";
const root = new URL("..", import.meta.url).pathname;
const dist = join(root, "dist");
const port = Number(process.env.PORT ?? 5173);

await build({ minify: false });

let timer: ReturnType<typeof setTimeout> | undefined;
watch(join(root, "src"), { recursive: true }, () => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    build({ minify: false }).catch((e) => console.error(e));
  }, 150);
});

Bun.serve({
  port,
  async fetch(req) {
    const path = normalize(decodeURIComponent(new URL(req.url).pathname));
    if (path.includes("..")) return new Response("Bad request", { status: 400 });
    const file = Bun.file(join(dist, path));
    if (path !== "/" && (await file.exists())) return new Response(file);
    return new Response(Bun.file(join(dist, "index.html")), { headers: { "content-type": "text/html" } });
  },
});
console.log(`ARUNARYA Sangam running at http://localhost:${port}`);
