/** Seller data: verification, own products, photos and the orders to fulfil. */
import { insert, select, selectOne, update, uploadPublicFile } from "@/lib/api/rest";
import type { OrderStatus } from "@/features/shop/api";

export type Verification = {
  profile_id: string;
  legal_name: string;
  business_address: string;
  pincode: string | null;
  customer_care_phone: string;
  gstin: string | null;
  status: "pending" | "verified" | "rejected";
  review_note: string | null;
  submitted_at: string;
};
export type VerificationInput = Pick<Verification, "legal_name" | "business_address" | "pincode" | "customer_care_phone" | "gstin">;

export const getMyVerification = (uid: string, token: string) =>
  selectOne<Verification>("seller_verifications", `profile_id=eq.${uid}&select=*`, token);

export async function saveVerification(uid: string, values: VerificationInput, existing: boolean, token: string) {
  return existing
    ? update<Verification>("seller_verifications", `profile_id=eq.${uid}`, values, token)
    : insert<Verification>("seller_verifications", { profile_id: uid, ...values }, token);
}

export type MyProduct = {
  id: string;
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
  blocked_reason: string | null;
  category: string | null;
  odop_product_id: string | null;
  country_of_origin: string;
  rating_avg: number | null;
  rating_count: number;
  updated_at: string;
};

const MY_PRODUCT_COLUMNS =
  "id,title,description,price_inr,mrp_inr,stock,unit,image_urls,gi_tagged,status,blocked,blocked_reason,category,odop_product_id,country_of_origin,rating_avg,rating_count,updated_at";

export const listMyProducts = (uid: string, token: string) =>
  select<MyProduct>("shop_products", `seller_id=eq.${uid}&select=${MY_PRODUCT_COLUMNS}&order=updated_at.desc`, token);

export const getMyProduct = (id: string, token: string) =>
  selectOne<MyProduct>("shop_products", `id=eq.${id}&select=${MY_PRODUCT_COLUMNS}`, token);

export type ProductInput = Pick<
  MyProduct,
  "title" | "description" | "price_inr" | "mrp_inr" | "stock" | "unit" | "image_urls" | "gi_tagged" | "status" | "category" | "odop_product_id" | "country_of_origin"
>;

export function saveProduct(uid: string, id: string | null, values: ProductInput, token: string) {
  return id
    ? update<MyProduct>("shop_products", `id=eq.${id}&select=${MY_PRODUCT_COLUMNS}`, values, token)
    : insert<MyProduct>("shop_products", { seller_id: uid, ...values }, token, `select=${MY_PRODUCT_COLUMNS}`);
}

export type OdopOption = { id: string; name: string; category: string; district: { name: string } | null };
export const listOdopProductsForDistrict = (districtId: string) =>
  select<OdopOption>("odop_products", `district_id=eq.${districtId}&select=id,name,category,district:districts(name)&order=name`);

// ---------- photos ----------
export const MAX_PHOTOS = 6;
const MAX_EDGE = 1600;

/** Shrinks a phone photo to at most 1600 px on its long edge before upload. */
export async function compressImage(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error("not_image");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const toBlob = (type: string) => new Promise<Blob | null>((r) => canvas.toBlob(r, type, 0.85));
  const webp = await toBlob("image/webp");
  if (webp && webp.type === "image/webp") return webp;
  return (await toBlob("image/jpeg")) ?? file;
}

export async function uploadProductPhoto(uid: string, file: File, token: string): Promise<string> {
  const blob = await compressImage(file);
  const ext = blob.type === "image/webp" ? "webp" : "jpg";
  return uploadPublicFile("product-images", `${uid}/${crypto.randomUUID()}.${ext}`, blob, token);
}

// ---------- orders to fulfil ----------
export type SellerOrderItem = {
  id: string;
  title: string;
  qty: number;
  unit_price_inr: number;
  status: OrderStatus;
  order: { id: string; created_at: string; payment_method: string; address: { name: string; phone: string; line1: string; line2?: string; city: string; state: string; pincode: string } } | null;
};

export const listSellerOrderItems = (uid: string, token: string) =>
  select<SellerOrderItem>(
    "order_items",
    `seller_id=eq.${uid}&select=id,title,qty,unit_price_inr,status,order:orders(id,created_at,payment_method,address)&order=id.desc&limit=100`,
    token,
  );

export const setItemStatus = (itemId: string, status: OrderStatus, token: string) =>
  update<SellerOrderItem>("order_items", `id=eq.${itemId}`, { status }, token);

export const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = { placed: "confirmed", confirmed: "shipped", shipped: "delivered" };
