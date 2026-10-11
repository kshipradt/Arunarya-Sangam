/**
 * Product page: photos, price with MRP, origin, the seller details the
 * e-commerce rules require, verified-purchase reviews, add to cart / buy now.
 */
import { useEffect, useState } from "react";
import { errorMessageKey } from "@/lib/api/errors";
import { useI18n, type MessageKey } from "@/i18n/I18nProvider";
import { useAuth } from "@/lib/auth/AuthProvider";
import { formatDate } from "@/lib/format";
import { Link, navigate } from "@/lib/router";
import { Alert, Button, PageSpinner } from "@/ui/controls";
import { NotFoundPage } from "@/features/home/HomePage";
import { getProduct, getReviews, getSellerDetails, getSettings, type ProductDetail, type Review, type SellerDetails } from "./api";
import { useCart } from "./CartProvider";
import { clampQty } from "./cartStore";
import { Price, Stars, useCategoryLabel } from "./ui";

export function ProductPage({ id }: { id: string }) {
  const { t, lang } = useI18n();
  const { session } = useAuth();
  const { add } = useCart();
  const categoryLabel = useCategoryLabel();
  const [product, setProduct] = useState<ProductDetail | null | undefined>(undefined);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [seller, setSeller] = useState<SellerDetails | null>(null);
  const [discount, setDiscount] = useState<number | null>(null);
  const [photo, setPhoto] = useState(0);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [addError, setAddError] = useState<MessageKey | null>(null);

  useEffect(() => {
    let live = true;
    setProduct(undefined);
    getProduct(id, session?.access_token)
      .then((p) => {
        if (!live) return;
        setProduct(p);
        if (p) {
          getReviews(p.id).then((r) => live && setReviews(r)).catch(() => {});
          getSellerDetails(p.seller_id).then((s) => live && setSeller(s)).catch(() => {});
        }
      })
      .catch(() => live && setProduct(null));
    getSettings().then((s) => live && setDiscount(s.standing_discount_percent ?? null)).catch(() => {});
    return () => {
      live = false;
    };
  }, [id, session?.access_token]);

  if (product === undefined) return <PageSpinner />;
  if (product === null) return <NotFoundPage />;

  const live = product.status === "active" && !product.blocked;
  const inStock = product.stock > 0;
  const images = product.image_urls.length ? product.image_urls : [];
  const origin = [product.district?.name, product.district?.state].filter(Boolean).join(", ");

  async function addToCart(goToCart: boolean) {
    setBusy(true);
    setAddError(null);
    try {
      await add(product!.id, clampQty(qty, product!.stock));
      setAdded(true);
      if (goToCart) navigate("/cart");
    } catch (e) {
      setAddError(errorMessageKey(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="container page-pad product-page">
      <nav className="breadcrumb" aria-label={t("shop.breadcrumb")}>
        <Link to="/shop">{t("shop.title")}</Link>
        {product.category && <> › <Link to={`/shop?category=${encodeURIComponent(product.category)}`}>{categoryLabel(product.category)}</Link></>}
      </nav>
      {!live && <Alert tone="info">{t("shop.notAvailable")}</Alert>}

      <div className="product-layout">
        <div className="gallery">
          <div className="gallery-main">
            {images[photo] ? <img src={images[photo]} alt={product.title} width={640} height={640} /> : <div className="img-placeholder" aria-hidden="true" />}
          </div>
          {images.length > 1 && (
            <ul className="gallery-thumbs" role="list">
              {images.map((src, i) => (
                <li key={src}>
                  <button type="button" aria-label={t("shop.photoN", { n: i + 1 })} aria-pressed={i === photo} onClick={() => setPhoto(i)}>
                    <img src={src} alt="" width={72} height={72} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="product-info">
          <h1>{product.title}</h1>
          <Stars value={product.rating_avg} count={product.rating_count} />
          <Price price={product.price_inr} mrp={product.mrp_inr} size="lg" />
          {discount ? <p className="sangam-benefit">{t("shop.standingDiscount", { percent: discount })}</p> : null}
          <ul className="facts" role="list">
            {origin && <li><strong>{t("shop.madeIn")}</strong> {origin}</li>}
            {product.odop && <li><strong>{t("shop.odopProduct")}</strong> {product.odop.name}</li>}
            {product.gi_tagged && <li><span className="badge badge-gi">{t("shop.gi")}</span> {t("shop.giExplained")}</li>}
            <li><strong>{t("shop.countryOfOrigin")}</strong> {product.country_of_origin}</li>
            <li><strong>{t("shop.unit")}</strong> {product.unit}</li>
          </ul>

          {live && (inStock ? (
            <div className="buy-box">
              <label className="qty">
                <span>{t("cart.qty")}</span>
                <select value={qty} onChange={(e) => setQty(Number(e.target.value))}>
                  {Array.from({ length: Math.min(product.stock, 20) }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              {product.stock <= 5 && <p className="low-stock">{t("shop.onlyLeft", { count: product.stock })}</p>}
              <div className="buy-actions">
                <Button busy={busy} onClick={() => addToCart(false)}>{t("shop.addToCart")}</Button>
                <Button variant="secondary" busy={busy} onClick={() => addToCart(true)}>{t("shop.buyNow")}</Button>
              </div>
              {addError && <Alert>{t(addError)}</Alert>}
              {added && <Alert tone="success">{t("shop.added")} <Link to="/cart">{t("cart.view")}</Link></Alert>}
            </div>
          ) : (
            <Alert tone="info">{t("shop.outOfStock")}</Alert>
          ))}

          <section className="seller-box" aria-labelledby="seller-h">
            <h2 id="seller-h">{t("shop.soldBy")}</h2>
            <p className="seller-name">
              {product.seller_name} {seller && <span className="badge badge-verified">{t("shop.verified")}</span>}
            </p>
            {seller ? (
              <dl className="seller-facts">
                <div><dt>{t("seller.legalName")}</dt><dd>{seller.legal_name}</dd></div>
                <div><dt>{t("seller.address")}</dt><dd>{seller.business_address}</dd></div>
                <div><dt>{t("seller.customerCare")}</dt><dd><a href={`tel:${seller.customer_care_phone.replace(/\s/g, "")}`}>{seller.customer_care_phone}</a></dd></div>
              </dl>
            ) : (
              <p className="small-print">{t("shop.sellerUnverified")}</p>
            )}
          </section>
        </div>
      </div>

      {product.description && (
        <section className="product-description">
          <h2>{t("shop.about")}</h2>
          {product.description.split(/\n{2,}/).map((para, i) => <p key={i}>{para}</p>)}
        </section>
      )}

      <section className="reviews" aria-labelledby="reviews-h">
        <h2 id="reviews-h">{t("review.title")}</h2>
        <p className="small-print">{t("review.verifiedOnly")}</p>
        {reviews.length === 0 ? (
          <p>{t("shop.noReviews")}</p>
        ) : (
          <ul className="review-list" role="list">
            {reviews.map((r) => (
              <li key={r.id}>
                <Stars value={r.rating} count={1} />
                {r.title && <p className="review-title">{r.title}</p>}
                {r.body && <p>{r.body}</p>}
                <p className="small-print">{r.buyer_name} · {formatDate(r.created_at, lang)} · {t("review.verifiedPurchase")}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  );
}
