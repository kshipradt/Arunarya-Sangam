/**
 * Shop data: catalogue search, product pages, cart, checkout and orders.
 * Prices, discounts and totals always come from the database.
 */
import { rpc, select, selectOne } from "@/lib/api/rest";

export const CATEGORIES = [
  "Textiles", "Handicrafts", "Woodcraft", "Metalcraft", "Pottery & Ceramics", "Glassware",
  "Folk Art & Paintings", "Jewellery", "Leather", "Food & Spices", "Agricultural Produce", "Home Decor", "Toys", "Other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export type ProductCard = {
  id: string;
  title: string;
  price_inr: number;
  mrp_inr: number | null;
  image_url: string | null;
  gi_tagged: boolean;
  stock: number;
  seller_id: string;
  seller_name: string;
  seller_verified: boolean;
  district_name: string | null;
  state_name: string | null;
  category: string | null;
  rating_avg: number | null;
  rating_count: number;
  total_count: number;
};

export type SearchParams = {
  q?: string;
  state?: number | null;
  district?: string | null;
  category?: string | null;
  min?: number | null;
  max?: number | null;
  gi?: boolean;
  sort?: "relevance" | "newest" | "price_asc" | "price_desc" | "rating";
  page?: number;
};

export const PAGE_SIZE = 24;

export function searchProducts(p: SearchParams, accessToken?: string | null) {
  return rpc<ProductCard[]>(
    "search_products",
    {
      p_query: p.q?.trim() || null,
      p_state: p.state ?? null,
      p_district: p.district ?? null,
      p_category: p.category ?? null,
      p_min: p.min ?? null,
      p_max: p.max ?? null,
      p_gi: p.gi ?? false,
      p_sort: p.sort ?? "relevance",
      p_limit: PAGE_SIZE,
      p_offset: (p.page ?? 0) * PAGE_SIZE,
    },
    accessToken,
  );
}

export type ProductDetail = {
  id: string;
  seller_id: string;
  seller_name: string;
  title: string;
  description: string | null;
  price_inr: number;
  mrp_inr: number | null;
  stock: number;
  unit: string;
  image_urls: string[];
  gi_tagged: boolean;
  status: "draft" | "active" | "paused";
  blocked: boolean;
  category: string | null;
  country_of_origin: string;
  rating_avg: number | null;
  rating_count: number;
  district_id: string | null;
  odop_product_id: string | null;
  district: { name: string; state: string } | null;
  odop: { name: string; category: string } | null;
};

const PRODUCT_COLUMNS =
  "id,seller_id,seller_name,title,description,price_inr,mrp_inr,stock,unit,image_urls,gi_tagged,status,blocked,category,country_of_origin,rating_avg,rating_count,district_id,odop_product_id,district:districts(name,state),odop:odop_products(name,category)";

export function getProduct(id: string, accessToken?: string | null) {
  return selectOne<ProductDetail>("shop_products", `id=eq.${id}&select=${PRODUCT_COLUMNS}`, accessToken);
}

export function getProductsByIds(ids: string[], accessToken?: string | null) {
  if (!ids.length) return Promise.resolve([] as ProductDetail[]);
  return select<ProductDetail>("shop_products", `id=in.(${ids.join(",")})&select=${PRODUCT_COLUMNS}`, accessToken);
}

export type SellerDetails = { legal_name: string; business_address: string; customer_care_phone: string; verified: boolean };
export async function getSellerDetails(sellerId: string) {
  const rows = await rpc<SellerDetails[]>("seller_public_details", { p_seller: sellerId });
  return rows[0] ?? null;
}

export type Review = { id: string; buyer_name: string; rating: number; title: string | null; body: string | null; created_at: string };
export function getReviews(productId: string) {
  return select<Review>("product_reviews", `product_id=eq.${productId}&hidden=eq.false&select=id,buyer_name,rating,title,body,created_at&order=created_at.desc&limit=30`);
}

export type Settings = Record<string, number>;
let settingsCache: Promise<Settings> | null = null;
export function getSettings(): Promise<Settings> {
  settingsCache ??= select<{ key: string; value: number }>("platform_settings", "select=key,value")
    .then((rows) => Object.fromEntries(rows.map((r) => [r.key, Number(r.value)])))
    .catch((e) => {
      settingsCache = null;
      throw e;
    });
  return settingsCache;
}

// ---------- checkout ----------
export type Quote = { subtotal: number; standing_discount: number; coupon_discount: number; shipping: number; total: number; coupon_ok: boolean };

export async function quoteCart(coupon: string | null, accessToken: string) {
  const rows = await rpc<Quote[]>("quote_cart", { p_coupon: coupon }, accessToken);
  return rows[0] ?? null;
}

export type Address = { name: string; phone: string; line1: string; line2?: string; city: string; state: string; pincode: string };
export function placeOrder(address: Address, method: "cod", coupon: string | null, accessToken: string) {
  return rpc<string>("place_order", { p_address: address, p_method: method, p_coupon: coupon }, accessToken);
}

// ---------- orders ----------
export type OrderItem = {
  id: string;
  product_id: string | null;
  title: string;
  unit_price_inr: number;
  qty: number;
  status: OrderStatus;
  review: { id: string; rating: number }[];
};
export type OrderStatus = "placed" | "confirmed" | "shipped" | "delivered" | "cancelled";
export type Order = {
  id: string;
  status: OrderStatus;
  payment_method: string;
  payment_status: string;
  subtotal_inr: number;
  standing_discount_inr: number;
  coupon_code: string | null;
  coupon_discount_inr: number;
  shipping_inr: number;
  total_inr: number;
  address: Address;
  created_at: string;
  order_items: OrderItem[];
};

const ORDER_COLUMNS = "*,order_items(id,product_id,title,unit_price_inr,qty,status,review:product_reviews(id,rating))";

export function listMyOrders(userId: string, accessToken: string) {
  return select<Order>("orders", `buyer_id=eq.${userId}&select=${ORDER_COLUMNS}&order=created_at.desc&limit=50`, accessToken);
}

export function getOrder(id: string, accessToken: string) {
  return selectOne<Order>("orders", `id=eq.${id}&select=${ORDER_COLUMNS}`, accessToken);
}

export const cancelOrder = (id: string, accessToken: string) => rpc<null>("cancel_order", { p_order: id }, accessToken);

export const submitReview = (orderItemId: string, rating: number, title: string, body: string, accessToken: string) =>
  rpc<string>("submit_review", { p_order_item: orderItemId, p_rating: rating, p_title: title, p_body: body }, accessToken);
