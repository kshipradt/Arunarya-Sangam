/**
 * Production build.
 *
 * Bundles src/main.tsx with Bun's bundler, splits each language into its own
 * chunk, fingerprints every file, and writes an index.html that references
 * the hashed assets. The output in dist/ is a static site that any static
 * host (Cloudflare Pages, Netlify, S3) can serve.
 */
import { rm, mkdir, readFile, writeFile, cp } from "node:fs/promises";
import { join, relative } from "node:path";
import { readPublicConfig } from "./config";

const root = new URL("..", import.meta.url).pathname;
const dist = join(root, "dist");

export async function build({ minify = true }: { minify?: boolean } = {}) {
  const config = readPublicConfig();
  await rm(dist, { recursive: true, force: true });
  await mkdir(join(dist, "assets"), { recursive: true });

  const result = await Bun.build({
    entrypoints: [join(root, "src/main.tsx")],
    outdir: join(dist, "assets"),
    target: "browser",
    format: "esm",
    splitting: true,
    minify,
    sourcemap: "linked",
    naming: {
      entry: "[name]-[hash].[ext]",
      chunk: "chunk-[hash].[ext]",
      asset: "[name]-[hash].[ext]",
    },
    define: {
      __APP_CONFIG__: JSON.stringify(config),
      "process.env.NODE_ENV": JSON.stringify(minify ? "production" : "development"),
    },
  });

  if (!result.success) {
    for (const log of result.logs) console.error(log);
    throw new Error("Build failed");
  }

  const files = result.outputs.map((o) => relative(dist, o.path));
  const entry = files.find((f) => /^assets\/main-.*\.js$/.test(f));
  const styles = files.filter((f) => f.endsWith(".css"));
  if (!entry) throw new Error("Entry bundle not found in build output");

  await cp(join(root, "public"), dist, { recursive: true });

  const template = await readFile(join(root, "src/index.html"), "utf8");
  const html = template
    .replace("<!--STYLES-->", styles.map((s) => `<link rel="stylesheet" href="/${s}">`).join("\n    "))
    .replace("<!--SCRIPT-->", `<script type="module" src="/${entry}"></script>`);
  await writeFile(join(dist, "index.html"), html);

  const totalKb = result.outputs.reduce((n, o) => n + o.size, 0) / 1024;
  console.log(`Built ${files.length} files (${totalKb.toFixed(0)} KB before compression) into dist/`);
  return { files };
}

if (import.meta.main) {
  await build({ minify: process.env.NODE_ENV !== "development" });
}
