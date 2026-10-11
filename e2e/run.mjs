/**
 * End-to-end browser test of Phase 1 and 2 journeys against the production build.
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

// Sample catalogue for the Phase 2 journeys.
const PHOTO = "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#c9875f"/><circle cx="5" cy="5" r="3" fill="#8c3a23"/></svg>');
const PRODUCTS = [
  { id: "00000000-0000-4000-8000-000000000001", title: "Hand-carved sheesham wood jewellery box", price_inr: 1450, mrp_inr: 1800, stock: 4, seller_id: "s1", seller_name: "Saharanpur Wood Works", category: "Woodcraft", gi_tagged: true },
  { id: "00000000-0000-4000-8000-000000000002", title: "Banarasi silk stole, zari border", price_inr: 2200, mrp_inr: null, stock: 12, seller_id: "s2", seller_name: "Kashi Looms", category: "Textiles", gi_tagged: true },
  { id: "00000000-0000-4000-8000-000000000003", title: "Moradabad brass diya set of 2", price_inr: 650, mrp_inr: 799, stock: 0, seller_id: "s3", seller_name: "Peetal Nagri Crafts", category: "Metalcraft", gi_tagged: false },
  { id: "00000000-0000-4000-8000-000000000004", title: "Khurja blue pottery planter", price_inr: 890, mrp_inr: null, stock: 20, seller_id: USER_ID, seller_name: "Test Maker", category: "Pottery & Ceramics", gi_tagged: false },
];
const card = (x) => ({ ...x, image_url: PHOTO, seller_verified: x.seller_id !== USER_ID, district_name: "Saharanpur", state_name: "Uttar Pradesh", rating_avg: x.id === PRODUCTS[0].id ? 4.8 : null, rating_count: x.id === PRODUCTS[0].id ? 12 : 0 });
const detail = (x) => ({ ...x, description: "Carved by hand from seasoned sheesham.\n\nEach piece is unique.", unit: "piece", image_urls: [PHOTO, PHOTO], status: "active", blocked: false, blocked_reason: null, country_of_origin: "India", rating_avg: 4.8, rating_count: 12, district_id: "d-sre", odop_product_id: "o1", district: { name: "Saharanpur", state: "Uttar Pradesh" }, odop: { name: "Wood craft", category: "Handicrafts" }, odop_product: null, updated_at: "2026-10-10T10:00:00Z" });
let cart = [];
const ORDER = {
  id: "0a1b2c3d-0000-4000-8000-000000000001", status: "placed", payment_method: "cod", payment_status: "pending",
  subtotal_inr: 2900, standing_discount_inr: 145, coupon_code: null, coupon_discount_inr: 0, shipping_inr: 0, total_inr: 2755,
  address: { name: "Test Maker", phone: "9876543210", line1: "12 Court Road", city: "Saharanpur", state: "Uttar Pradesh", pincode: "247001" },
  created_at: "2026-10-11T08:00:00Z",
  order_items: [{ id: "oi1", product_id: "00000000-0000-4000-8000-000000000001", title: "Hand-carved sheesham wood jewellery box", unit_price_inr: 1450, qty: 2, status: "placed", review: [] }],
};
const TICKET = { id: "t1", ticket_no: "SG-000101", category: "order", subject: "Cracked lid", status: "open", order_id: null, created_at: "2026-10-11T09:00:00Z", ack_due_at: "2026-10-13T09:00:00Z", resolve_due_at: "2026-11-10T09:00:00Z", acknowledged_at: null, resolved_at: null };


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

  // ---------- Phase 2: shop, cart, orders, seller, help, advertising ----------
  if (p === "/rest/v1/rpc/search_products") return json(200, PRODUCTS.map((x, i) => ({ ...card(x), total_count: PRODUCTS.length })));
  if (p === "/rest/v1/shop_products" && req.method() === "GET") {
    if (url.search.includes("seller_id=eq.")) return json(200, PRODUCTS.filter((x) => x.seller_id === USER_ID).map(detail));
    const ids = (url.searchParams.get("id") ?? "").replace(/^(eq\.|in\.\()|\)$/g, "").split(",");
    return json(200, PRODUCTS.filter((x) => ids.includes(x.id)).map(detail));
  }
  if (p === "/rest/v1/rpc/seller_public_details") return json(200, [{ legal_name: "Saharanpur Wood Works", business_address: "12 Kamboh Pul, Saharanpur, UP 247001", customer_care_phone: "+91 98765 43210" }]);
  if (p === "/rest/v1/product_reviews") return json(200, [{ id: "r1", buyer_name: "Asha", rating: 5, title: "Beautiful carving", body: "Arrived well packed.", created_at: "2026-10-01T10:00:00Z" }]);
  if (p === "/rest/v1/platform_settings") return json(200, [{ key: "standing_discount_percent", value: 5 }]);
  if (p === "/rest/v1/cart_items") {
    if (req.method() === "GET") return json(200, cart.map((l) => ({ product_id: l.product_id, qty: l.qty })));
    if (req.method() === "POST") {
      for (const row of [body].flat()) { cart = cart.filter((l) => l.product_id !== row.product_id); cart.push(row); }
      return route.fulfill({ status: 201 });
    }
    if (req.method() === "DELETE") { cart = cart.filter((l) => !url.search.includes(l.product_id)); return route.fulfill({ status: 204 }); }
  }
  if (p === "/rest/v1/rpc/quote_cart") {
    const subtotal = cart.reduce((s, l) => s + PRODUCTS.find((x) => x.id === l.product_id).price_inr * l.qty, 0);
    const standing = Math.round(subtotal * 0.05);
    return json(200, [{ subtotal, standing_discount: standing, coupon_discount: 0, shipping: 0, total: subtotal - standing, coupon_ok: false }]);
  }
  if (p === "/rest/v1/rpc/place_order") { cart = []; return json(200, ORDER.id); }
  if (p === "/rest/v1/orders") return json(200, [ORDER]);
  if (p === "/rest/v1/seller_verifications") return json(200, []);
  if (p === "/rest/v1/order_items") return json(200, []);
  if (p === "/rest/v1/staff") return json(200, []);
  if (p === "/rest/v1/rpc/open_ticket") return json(200, "SG-000101");
  if (p === "/rest/v1/tickets") return json(200, url.search.includes("ticket_no") || url.search.includes("id=eq") ? [TICKET] : [TICKET]);
  if (p === "/rest/v1/ticket_messages") return json(200, [{ id: "m1", from_staff: false, body: "My order arrived with a cracked lid.", created_at: "2026-10-11T09:00:00Z" }]);
  if (p === "/rest/v1/ad_inquiries" && req.method() === "POST") return route.fulfill({ status: 201 });
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

  // 6. Shop as a guest (desktop, English): browse, product page, add to cart
  {
    const { page, errors, ctx } = await newPage(1280, 900);
    await page.goto(base + "/shop?lang=en");
    await page.waitForSelector(".product-tile");
    check("Shop lists products from search", (await page.locator(".product-tile").count()) === 4);
    check("Out-of-stock product is labelled", (await page.locator(".product-oos").count()) === 1);
    await page.screenshot({ path: join(out, "08-shop-desktop.png"), fullPage: true });
    await page.locator(".product-tile", { hasText: "sheesham" }).click();
    await page.waitForSelector(".buy-box");
    const facts = await page.locator(".product-info").innerText();
    check("Product page shows GI, ODOP and ARUNARYA discount", /GI/.test(facts) && /ODOP/.test(facts) && /5% ARUNARYA/.test(facts));
    check("Product page shows seller legal details", (await page.locator(".seller-facts").innerText()).includes("Kamboh Pul"));
    await page.getByLabel("Quantity").selectOption("2");
    await page.getByRole("button", { name: "Add to cart" }).click();
    await page.waitForSelector(".cart-count");
    check("Cart badge counts added items", (await page.locator(".cart-count").innerText()) === "2");
    await page.screenshot({ path: join(out, "09-product-desktop.png"), fullPage: true });
    await page.getByRole("link", { name: "View cart" }).click();
    await page.waitForSelector(".cart-line");
    check("Guest cart keeps the line after navigation", (await page.locator(".cart-line").count()) === 1);
    await page.screenshot({ path: join(out, "10-cart-guest-desktop.png"), fullPage: true });
    check("No browser errors while shopping", errors.length === 0, errors.join(" | "));
    // 7. Checkout needs sign-in; the guest cart merges into the account
    await page.getByRole("button", { name: "Proceed to checkout" }).click();
    await page.waitForURL("**/auth/sign-in**");
    await page.getByLabel("Email address").fill("maker@example.in");
    await page.getByLabel("Password", { exact: true }).fill("Correct-Horse9!");
    await page.waitForTimeout(100);
    await page.getByRole("button", { name: "Log in", exact: true }).click();
    await page.waitForURL("**/checkout**");
    await page.waitForSelector(".quote .total");
    check("Guest cart merged into the account on sign-in", cart.length === 1 && cart[0].qty === 2, JSON.stringify(cart));
    const total = await page.locator(".quote .total dd").innerText();
    check("Checkout total comes from the database quote", total.includes("2,755"), total);
    await page.getByLabel("Mobile number").fill("98765 43210");
    await page.getByLabel("House, street and area").fill("12 Court Road");
    await page.getByLabel("City").fill("Saharanpur");
    await page.getByLabel("State").selectOption({ label: "Uttar Pradesh" });
    await page.getByLabel("PIN code").fill("247001");
    await page.screenshot({ path: join(out, "11-checkout-desktop.png"), fullPage: true });
    await page.getByRole("button", { name: "Place order" }).click();
    await page.waitForURL("**/orders/**placed=1");
    const order = calls.filter((c) => c.path.startsWith("/rest/v1/rpc/place_order")).at(-1)?.body;
    check("Order is placed as cash on delivery with a clean address", order?.p_method === "cod" && order?.p_address?.phone === "9876543210" && order?.p_address?.pincode === "247001", JSON.stringify(order));
    await page.waitForSelector(".tracker");
    check("Order page shows the thank-you and tracker", (await page.locator(".alert-success").count()) === 1 && (await page.locator(".tracker li").count()) === 4);
    await page.screenshot({ path: join(out, "12-order-desktop.png"), fullPage: true });
    check("No browser errors during checkout", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  // 8. Phone layouts in Hindi and Urdu for the new screens
  {
    const { page, errors, ctx } = await newPage(390, 844);
    for (const [code, path, shot] of [["hi", "/shop", "13-shop-hindi-phone"], ["hi", "/product/00000000-0000-4000-8000-000000000001", "14-product-hindi-phone"], ["ur", "/shop", "15-shop-urdu-phone"], ["hi", "/advertise", "16-advertise-hindi-phone"]]) {
      await page.goto(`${base}${path}?lang=${code}`);
      await page.waitForSelector("h1");
      await page.waitForTimeout(150);
      check(`${path} in ${code} fits a 390 px phone`, await noSidewaysScroll(page));
      await page.screenshot({ path: join(out, shot + ".png"), fullPage: true });
    }
    check("No browser errors on phone shop pages", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  // 9. Advertise enquiry (English)
  {
    const { page, errors, ctx } = await newPage(1280, 900);
    await page.goto(base + "/?lang=en");
    await page.waitForSelector(".ad-band");
    check("Home page highlights advertising", (await page.locator(".ad-band").count()) === 1 && (await page.locator(".main-nav .nav-highlight").count()) === 1);
    await page.screenshot({ path: join(out, "17-home-desktop.png"), fullPage: true });
    await page.locator(".ad-band a").click();
    await page.waitForURL("**/advertise");
    await page.getByRole("button", { name: "Send enquiry" }).click();
    check("Empty enquiry shows errors", (await page.locator(".field-error").count()) >= 2);
    await page.getByLabel("Full name").fill("Meera Handlooms");
    await page.getByLabel("Email address").fill("meera@example.in");
    await page.getByLabel("Monthly budget").selectOption("5to25k");
    await page.getByRole("button", { name: "Send enquiry" }).click();
    await page.waitForSelector(".alert-success");
    const ad = calls.filter((c) => c.path === "/rest/v1/ad_inquiries").at(-1)?.body;
    check("Advertising enquiry is saved", ad?.email === "meera@example.in" && ad?.budget_range === "5to25k", JSON.stringify(ad));
    await page.screenshot({ path: join(out, "18-advertise-desktop.png"), fullPage: true });
    check("No browser errors on advertise", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  // 10. Seller centre and complaints (signed in, phone, English)
  {
    const { page, errors, ctx } = await newPage(390, 844);
    await page.goto(base + "/auth/sign-in?lang=en&next=%2Fsell");
    await page.getByLabel("Email address").fill("maker@example.in");
    await page.getByLabel("Password", { exact: true }).fill("Correct-Horse9!");
    await page.waitForTimeout(100);
    await page.getByRole("button", { name: "Log in", exact: true }).click();
    await page.waitForURL("**/sell");
    await page.waitForSelector(".seller-product-row");
    check("Seller centre asks unverified sellers to verify", (await page.locator(".alert-info", { hasText: "Verify" }).count()) === 1);
    check("Seller centre lists the seller's own products", (await page.locator(".seller-product-row").count()) === 1);
    check("Seller centre fits a 390 px phone", await noSidewaysScroll(page));
    await page.screenshot({ path: join(out, "19-seller-phone.png"), fullPage: true });
    await page.goto(base + "/sell/products/new");
    await page.waitForSelector("form");
    check("A signed-in person on a new device gets their profile language", (await page.getAttribute("html", "lang")) === "hi");
    await page.goto(base + "/sell/products/new?lang=en");
    await page.waitForSelector("form");
    await page.getByRole("button", { name: "Publish" }).click();
    check("Publishing an empty product shows errors", (await page.locator(".field-error").count()) >= 2);
    await page.screenshot({ path: join(out, "20-product-form-phone.png"), fullPage: true });
    await page.goto(base + "/help/new?lang=en");
    await page.getByLabel("Subject").fill("Cracked lid");
    await page.getByLabel("Tell us what happened").fill("My order arrived with a cracked lid.");
    await page.getByRole("button", { name: "Submit complaint" }).click();
    await page.waitForURL("**/help/t1?new=1");
    check("Complaint gets a ticket number and legal deadlines", (await page.locator(".alert-success").innerText()).includes("SG-000101") && (await page.locator(".summary dd").count()) >= 2);
    await page.screenshot({ path: join(out, "21-complaint-phone.png"), fullPage: true });
    check("No browser errors for seller and help", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  // 11. Every language renders the shop, cart and advertise pages without missing text
  {
    const { page, ctx } = await newPage(390, 844);
    for (const code of ["en", "hi", "bn", "mr", "te", "ta", "gu", "ur", "kn", "or", "ml", "pa", "as"]) {
      let leaked = false, fits = true;
      for (const path of ["/shop", "/cart", "/advertise"]) {
        await page.goto(`${base}${path}?lang=${code}`);
        await page.waitForSelector("h1");
        await page.waitForTimeout(80);
        const text = await page.locator("body").innerText();
        leaked ||= /\b(shop|cart|cat|ad|nav|home|sell|help|checkout|orders|status|review)\.[a-zA-Z]+/.test(text);
        const f = await noSidewaysScroll(page);
        if (!f) console.log("  overflow", code, path, await page.evaluate(() => [...document.querySelectorAll("body *")].filter((e) => e.getBoundingClientRect().right > innerWidth + 1 || e.getBoundingClientRect().left < -1).slice(0, 4).map((e) => e.tagName + "." + e.className + " " + Math.round(e.getBoundingClientRect().left) + "→" + Math.round(e.getBoundingClientRect().right)).join(", ")));
        if (/\b(shop|cart|cat|ad|nav|home|sell|help|checkout|orders|status|review)\.[a-zA-Z]+/.test(await page.locator("body").innerText())) console.log("  leaked", code, path);
        fits &&= f;
      }
      check(`Shop, cart and advertise in ${code}: translated, fit phone`, !leaked && fits);
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
