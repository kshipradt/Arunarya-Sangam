/** Small shop building blocks shared by catalogue, product, cart and orders. */
import { useI18n, type MessageKey } from "@/i18n/I18nProvider";
import { formatInr, percentOff } from "@/lib/format";
import { Link } from "@/lib/router";
import type { OrderStatus, ProductCard } from "./api";

const CATEGORY_KEYS: Record<string, MessageKey> = {
  Textiles: "cat.textiles",
  Handicrafts: "cat.handicrafts",
  Woodcraft: "cat.woodcraft",
  Metalcraft: "cat.metalcraft",
  "Pottery & Ceramics": "cat.pottery",
  Ceramics: "cat.pottery",
  Glassware: "cat.glassware",
  "Folk Art & Paintings": "cat.folkArt",
  "Folk Art": "cat.folkArt",
  Jewellery: "cat.jewellery",
  Leather: "cat.leather",
  "Food & Spices": "cat.food",
  "Agricultural Produce": "cat.agri",
  "Home Decor": "cat.decor",
  Toys: "cat.toys",
  Other: "cat.other",
};

export function useCategoryLabel() {
  const { t } = useI18n();
  return (c: string | null | undefined) => (c ? (CATEGORY_KEYS[c] ? t(CATEGORY_KEYS[c]!) : c) : "");
}

export function Price({ price, mrp, size = "md" }: { price: number; mrp?: number | null; size?: "md" | "lg" }) {
  const { lang, t } = useI18n();
  const off = percentOff(Number(price), mrp ? Number(mrp) : null);
  return (
    <p className={`price price-${size}`}>
      <span className="price-now">{formatInr(price, lang)}</span>
      {off !== null && (
        <>
          {" "}
          <s className="price-mrp" aria-label={t("shop.mrp", { price: formatInr(mrp!, lang) })}>{formatInr(mrp!, lang)}</s>{" "}
          <span className="price-off">{t("shop.off", { percent: off })}</span>
        </>
      )}
    </p>
  );
}

export function Stars({ value, count }: { value: number | null; count: number }) {
  const { t } = useI18n();
  if (!count || value === null) return <span className="stars stars-none">{t("shop.noReviews")}</span>;
  const rounded = Math.round(Number(value) * 2) / 2;
  return (
    <span className="stars" aria-label={t("shop.ratingLabel", { rating: Number(value).toFixed(1), count })}>
      <span aria-hidden="true">{"★".repeat(Math.floor(rounded))}{rounded % 1 ? "½" : ""}</span>{" "}
      <span className="stars-num" aria-hidden="true">{Number(value).toFixed(1)} ({count})</span>
    </span>
  );
}

export function ProductTile({ p }: { p: ProductCard }) {
  const { t } = useI18n();
  const categoryLabel = useCategoryLabel();
  return (
    <li className="product-tile">
      <Link to={`/product/${p.id}`} className="product-tile-link">
        <div className="product-img">
          {p.image_url ? <img src={p.image_url} alt="" loading="lazy" width={320} height={320} /> : <div className="img-placeholder" aria-hidden="true" />}
          {p.gi_tagged && <span className="badge badge-gi">{t("shop.gi")}</span>}
        </div>
        <div className="product-tile-body">
          <h3>{p.title}</h3>
          <Price price={p.price_inr} mrp={p.mrp_inr} />
          <Stars value={p.rating_avg} count={p.rating_count} />
          <p className="product-origin">
            {[p.district_name, p.state_name].filter(Boolean).join(", ")}
            {p.category && <> · {categoryLabel(p.category)}</>}
          </p>
          <p className="product-seller">
            {p.seller_name}
            {p.seller_verified && <span className="badge badge-verified">{t("shop.verified")}</span>}
          </p>
          {p.stock === 0 && <p className="product-oos">{t("shop.outOfStock")}</p>}
        </div>
      </Link>
    </li>
  );
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const { t } = useI18n();
  return <span className={`status status-${status}`}>{t(`status.${status}` as MessageKey)}</span>;
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="empty-state">
      <p className="empty-title">{title}</p>
      {children}
    </div>
  );
}
