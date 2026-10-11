/**
 * End-to-end browser test of Phase 1 journeys against the production build.
 *
 * The Supabase API and Cloudflare Turnstile are replaced by deterministic
 * fakes, so the test checks the app's own behaviour: language choice,
 * sign-up validation, log-in errors, profile completion, RTL layout, and
 * that no page scrolls sideways on a 390 px phone.
 *
 * Usage: bun run build && node e2e/run.mjs
 */
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { join, extname, normalize } from "node:path";
import { chromium } from "playwright";

const root = new URL("..", import.meta.url).pathname;
const dist = join(root, "dist");
const out = join(root, "e2e/output");
await mkdir(out, { recursive: true });

// ---------- static server with SPA fallback ----------
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".json": "application/json", ".webmanifest": "application/manifest+json" };
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname));
  try {
    const file = path === "/" ? join(dist, "index.html") : join(dist, path);
    const body = await readFile(file);
    res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(await readFile(join(dist, "index.html")));
  }
}).listen(4173);

// ---------- fake backend ----------
const USER_ID = "6f1c1b2a-1111-4c4c-8a8a-123456789abc";
const jwt = (() => {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b({ alg: "HS256" })}.${b({ sub: USER_ID, email: "maker@example.in" })}.sig`;
})();
let profile = {
  id: USER_ID, role: "artisan", full_name: "Test Maker", business_name: null,
  country_id: null, state_id: null, city_id: null, city_name: null, district_id: null,
  preferred_language: "hi", onboarding_complete: false, verified: false,
};
const calls = [];

async function fakeSupabase(route) {
  const req = route.request();
  const url = new URL(req.url());
  const body = req.postData() ? JSON.parse(req.postData()) : null;
  calls.push({ method: req.method(), path: url.pathname + url.search, body });
  const json = (status, data) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
  const p = url.pathname;

  if (p === "/auth/v1/signup") return json(200, { id: USER_ID, email: body.email });
  if (p === "/auth/v1/token") {
    if (body.password === "Correct-Horse9!") {
      return json(200, { access_token: jwt, refresh_token: "refresh-1", expires_in: 3600, user: { id: USER_ID, email: body.email, user_metadata: {} } });
    }
    return json(400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
  }
  if (p === "/auth/v1/logout") return route.fulfill({ status: 204 });
  if (p === "/rest/v1/geo_countries") return json(200, [
    { id: 101, iso2: "IN", name: "India", native_name: "भारत", emoji: "🇮🇳" },
    { id: 233, iso2: "US", name: "United States", native_name: null, emoji: "🇺🇸" },
  ]);
  if (p === "/rest/v1/geo_states") return json(200, url.search.includes("101")
    ? [{ id: 4022, name: "Uttar Pradesh" }, { id: 4008, name: "Maharashtra" }]
    : [{ id: 1452, name: "New York" }]);
  if (p === "/rest/v1/geo_cities") return json(200, url.search.includes("4022")
    ? [{ id: 133034, name: "Saharanpur" }, { id: 132911, name: "Lucknow" }]
    : [{ id: 1, name: "Mumbai" }]);
  if (p === "/rest/v1/districts") return json(200, [{ id: "d-sre", name: "Saharanpur" }, { id: "d-lko", name: "Lucknow" }]);
  if (p === "/rest/v1/profiles" && req.method() === "GET") return json(200, [profile]);
  if (p === "/rest/v1/profiles" && req.method() === "PATCH") {
    profile = { ...profile, ...body };
    return json(200, [profile]);
  }
  return json(404, { message: "not mocked: " + p });
}

// Cloudflare's test widget passes immediately; this fake does the same.
const fakeTurnstile = `window.turnstile = {
  render(el, o) { el.innerHTML = '<div role="checkbox" aria-checked="true" style="padding:12px;border:1px solid #ccc;border-radius:6px">✓ Success (test)</div>'; setTimeout(() => o.callback("test-token"), 30); return "w" + Math.random(); },
  remove() {}, reset() {}
};`;

// ---------- run ----------
const browser = await chromium.launch();
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

async function newPage(width, height) {
  const ctx = await browser.newContext({ viewport: { width, height }, locale: "en-IN" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  await page.route("**/*.supabase.co/**", fakeSupabase);
  await page.route("https://challenges.cloudflare.com/**", (r) => r.fulfill({ contentType: "text/javascript", body: fakeTurnstile }));
  await page.route("https://fonts.googleapis.com/**", (r) => r.fulfill({ contentType: "text/css", body: "" }));
  return { page, errors, ctx };
}

const noSidewaysScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const base = "http://localhost:4173";

try {
  // 1. Language gate (desktop)
  {
    const { page, errors, ctx } = await newPage(1280, 860);
    await page.goto(base + "/");
    const tiles = await page.locator(".lang-tile").count();
    check("Language chooser shows 13 languages first", tiles === 13, `${tiles} tiles`);
    await page.screenshot({ path: join(out, "01-language-desktop.png"), fullPage: true });
    await page.locator(".lang-tile", { hasText: "हिन्दी" }).click();
    await page.waitForSelector("h1");
    const h1 = await page.locator("h1").first().innerText();
    check("Choosing Hindi switches the whole page to Hindi", h1.includes("ज़िले"), h1);
    check("Page language attribute is hi", (await page.getAttribute("html", "lang")) === "hi");
    await page.screenshot({ path: join(out, "02-home-hindi-desktop.png"), fullPage: true });
    check("No browser errors on home", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  // 2. Sign-up validation and password rules (phone, Hindi)
  {
    const { page, errors, ctx } = await newPage(390, 844);
    await page.goto(base + "/?lang=hi");
    await page.goto(base + "/auth/sign-up?role=artisan&lang=hi");
    await page.waitForSelector("form");
    await page.getByRole("button", { name: "खाता बनाएँ" }).click();
    const errs = await page.locator(".field-error").allInnerTexts();
    check("Empty sign-up shows field errors in Hindi", errs.length >= 4 && errs.some((e) => e.includes("ज़रूरी")), `${errs.length} errors`);
    await page.getByLabel("पासवर्ड", { exact: true }).fill("India@123");
    const commonRule = await page.locator(".pw-rules li", { hasText: "आम तौर पर" }).getAttribute("class");
    check("A common password like India@123 is flagged", commonRule !== "ok");
    await page.getByLabel("पूरा नाम").fill("वृंदा तिवारी");
    await page.getByLabel("ईमेल पता").fill("maker@example.in");
    await page.getByLabel("पासवर्ड", { exact: true }).fill("Kashi-Weave-2026!");
    await page.getByLabel("पासवर्ड की पुष्टि करें").fill("Kashi-Weave-2026?");
    await page.locator(".checkbox input").check();
    await page.waitForTimeout(100);
    await page.getByRole("button", { name: "खाता बनाएँ" }).click();
    const mismatch = await page.locator(".field-error", { hasText: "मेल नहीं" }).count();
    check("Mismatched confirmation is caught", mismatch === 1);
    await page.getByLabel("पासवर्ड की पुष्टि करें").fill("Kashi-Weave-2026!");
    await page.screenshot({ path: join(out, "03-signup-hindi-phone.png"), fullPage: true });
    await page.getByRole("button", { name: "खाता बनाएँ" }).click();
    await page.waitForURL("**/auth/check-email**");
    const signup = calls.find((c) => c.path.startsWith("/auth/v1/signup"));
    check("Sign-up sends role, name, language and captcha token",
      signup?.body?.data?.role === "artisan" && signup?.body?.data?.preferred_language === "hi" &&
      signup?.body?.gotrue_meta_security?.captcha_token === "test-token" && signup?.body?.code_challenge_method === "s256",
      JSON.stringify(signup?.body?.data));
    check("Sign-up page fits a 390 px phone", await noSidewaysScroll(page));
    await page.screenshot({ path: join(out, "04-check-email-phone.png"), fullPage: true });
    check("No browser errors during sign-up", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  // 3. Log-in errors, then success leading to profile completion (phone, Hindi)
  {
    const { page, errors, ctx } = await newPage(390, 844);
    await page.goto(base + "/auth/sign-in?lang=hi");
    await page.getByLabel("ईमेल पता").fill("maker@example.in");
    await page.getByLabel("पासवर्ड", { exact: true }).fill("wrong-password");
    await page.waitForTimeout(100);
    await page.getByRole("button", { name: "लॉग इन", exact: true }).click();
    const alert = await page.locator(".alert-error").innerText();
    check("Wrong password shows a clear Hindi message", alert.includes("गलत"), alert);
    await page.getByLabel("पासवर्ड", { exact: true }).fill("Correct-Horse9!");
    await page.waitForTimeout(100);
    await page.getByRole("button", { name: "लॉग इन", exact: true }).click();
    await page.waitForURL("**/account/complete-profile**");
    check("A new account is sent to complete its profile", true);

    // Artisan in India: state, district, city
    await page.getByLabel("राज्य या क्षेत्र").click();
    await page.getByRole("option", { name: "Uttar Pradesh" }).click();
    await page.getByLabel("ODOP ज़िला").click();
    await page.getByRole("option", { name: "Saharanpur" }).click();
    await page.getByLabel("शहर", { exact: true }).click();
    await page.getByRole("option", { name: "Saharanpur" }).click();
    await page.screenshot({ path: join(out, "05-profile-hindi-phone.png"), fullPage: true });
    check("Profile page fits a 390 px phone", await noSidewaysScroll(page));
    await page.getByRole("button", { name: "सहेजें और आगे बढ़ें" }).click();
    await page.waitForURL("**/account?saved=1");
    const patch = calls.filter((c) => c.method === "PATCH").at(-1)?.body;
    check("Profile saves country, state, city and ODOP district",
      patch?.country_id === 101 && patch?.state_id === 4022 && patch?.city_id === 133034 && patch?.district_id === "d-sre" && patch?.onboarding_complete === true,
      JSON.stringify(patch));
    await page.screenshot({ path: join(out, "06-account-hindi-phone.png"), fullPage: true });
    check("No browser errors during log-in and profile", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  // 4. Urdu: right-to-left layout
  {
    const { page, errors, ctx } = await newPage(390, 844);
    await page.goto(base + "/auth/sign-in?lang=ur");
    await page.waitForSelector("h1");
    check("Urdu switches the page to right-to-left", (await page.getAttribute("html", "dir")) === "rtl");
    check("Urdu sign-in fits a 390 px phone", await noSidewaysScroll(page));
    await page.screenshot({ path: join(out, "07-signin-urdu-phone.png"), fullPage: true });
    check("No browser errors in Urdu", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  // 5. Every language renders the sign-up page without missing text
  {
    const { page, ctx } = await newPage(390, 844);
    for (const code of ["en", "hi", "bn", "mr", "te", "ta", "gu", "ur", "kn", "or", "ml", "pa", "as"]) {
      await page.goto(`${base}/auth/sign-up?lang=${code}`);
      await page.waitForSelector("h1");
      const text = await page.locator("main").innerText();
      const leaked = /\b(auth|pw|v|field|roles)\.[a-zA-Z]+/.test(text);
      const fits = await noSidewaysScroll(page);
      check(`Sign-up in ${code}: all text translated, fits phone`, !leaked && fits);
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  server.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
