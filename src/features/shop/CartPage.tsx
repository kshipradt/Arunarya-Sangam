import { useEffect, useMemo, useState } from "react";
import { useI18n, type MessageKey } from "@/i18n/I18nProvider";
import { errorMessageKey } from "@/lib/api/errors";
import { useAuth } from "@/lib/auth/AuthProvider";
import { formatInr } from "@/lib/format";
import { Link, navigate } from "@/lib/router";
import { Alert, Button, PageSpinner } from "@/ui/controls";
import { getProductsByIds, quoteCart, type ProductDetail, type Quote } from "./api";
import { useCart } from "./CartProvider";
import { EmptyState, Price } from "./ui";

export function QuoteSummary({ quote, coupon }: { quote: Quote; coupon: string | null }) {
  const { t, lang } = useI18n();
  const saved = Number(quote.standing_discount) + Number(quote.coupon_discount);
  return (
    <dl className="quote">
      <div><dt>{t("cart.subtotal")}</dt><dd>{formatInr(quote.subtotal, lang)}</dd></div>
      {Number(quote.standing_discount) > 0 && <div className="saving"><dt>{t("cart.sangamDiscount")}</dt><dd>−{formatInr(quote.standing_discount, lang)}</dd></div>}
      {quote.coupon_ok && coupon && <div className="saving"><dt>{t("cart.coupon", { code: coupon })}</dt><dd>−{formatInr(quote.coupon_discount, lang)}</dd></div>}
      <div><dt>{t("cart.delivery")}</dt><dd>{Number(quote.shipping) === 0 ? t("cart.free") : formatInr(quote.shipping, lang)}</dd></div>
      <div className="total"><dt>{t("cart.total")}</dt><dd>{formatInr(quote.total, lang)}</dd></div>
      {saved > 0 && <p className="you-save">{t("cart.youSave", { amount: formatInr(saved, lang) })}</p>}
    </dl>
  );
}

export function CartPage() {
  const { t, lang } = useI18n();
  const { status, getAccessToken } = useAuth();
  const { lines, ready, revision, setQty, removeLine } = useCart();
  const [products, setProducts] = useState<Record<string, ProductDetail>>({});
  const [loaded, setLoaded] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [coupon, setCoupon] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);
  const ids = useMemo(() => lines.map((l) => l.productId).sort().join(","), [lines]);

  useEffect(() => {
    if (!ready) return;
    getProductsByIds(ids ? ids.split(",") : [])
      .then((rows) => setProducts(Object.fromEntries(rows.map((p) => [p.id, p]))))
      .catch((e) => setError(errorMessageKey(e)))
      .finally(() => setLoaded(true));
  }, [ids, ready]);

  // Signed-in totals always come from the server, once the database cart has caught up.
  useEffect(() => {
    if (status !== "signedIn" || !ready || !lines.length) return setQuote(null);
    let live = true;
    getAccessToken()
      .then((tok) => quoteCart(appliedCoupon, tok))
      .then((q) => live && setQuote(q))
      .catch((e) => live && setError(errorMessageKey(e)));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, ready, revision, appliedCoupon]);

  if (!ready || !loaded) return <PageSpinner />;
  if (!lines.length) {
    return (
      <section className="container narrow page-pad">
        <h1>{t("cart.title")}</h1>
        <EmptyState title={t("cart.empty")}>
          <Link to="/shop" className="btn btn-primary">{t("cart.startShopping")}</Link>
        </EmptyState>
      </section>
    );
  }

  const unavailable = lines.filter((l) => {
    const p = products[l.productId];
    return !p || p.status !== "active" || p.blocked || p.stock < l.qty;
  });
  const estimate = lines.reduce((n, l) => n + Number(products[l.productId]?.price_inr ?? 0) * l.qty, 0);

  return (
    <section className="container page-pad cart">
      <h1>{t("cart.title")}</h1>
      {error && <Alert>{t(error)}</Alert>}
      <div className="cart-layout">
        <ul className="cart-lines" role="list">
          {lines.map((l) => {
            const p = products[l.productId];
            const problem = !p || p.status !== "active" || p.blocked ? "cart.unavailable" : p.stock < l.qty ? "cart.notEnoughStock" : null;
            return (
              <li key={l.productId} className="cart-line">
                {p?.image_urls[0] ? <img src={p.image_urls[0]} alt="" width={88} height={88} /> : <div className="img-placeholder small" aria-hidden="true" />}
                <div className="cart-line-body">
                  <Link to={`/product/${l.productId}`} className="cart-line-title">{p?.title ?? t("cart.unavailable")}</Link>
                  {p && <Price price={p.price_inr} mrp={p.mrp_inr} />}
                  {problem && <p className="field-error">{t(problem as MessageKey, { count: p?.stock ?? 0 })}</p>}
                  <div className="cart-line-actions">
                    <label>
                      <span className="sr-only">{t("cart.qty")}</span>
                      <select value={l.qty} onChange={(e) => void setQty(l.productId, Number(e.target.value)).catch((err) => setError(errorMessageKey(err)))} aria-label={t("cart.qty")}>
                        {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </label>
                    <button type="button" className="link-button" onClick={() => void removeLine(l.productId).catch((err) => setError(errorMessageKey(err)))}>{t("cart.remove")}</button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <aside className="cart-summary">
          {status === "signedIn" ? (
            <>
              {quote ? <QuoteSummary quote={quote} coupon={appliedCoupon} /> : <PageSpinner />}
              <form
                className="coupon"
                onSubmit={(e) => {
                  e.preventDefault();
                  setAppliedCoupon(coupon.trim().toUpperCase() || null);
                }}
              >
                <label htmlFor="coupon">{t("cart.couponLabel")}</label>
                <div className="row-inline">
                  <input id="coupon" value={coupon} onChange={(e) => setCoupon(e.target.value)} autoCapitalize="characters" maxLength={20} />
                  <Button type="submit" variant="secondary">{t("cart.apply")}</Button>
                </div>
                {appliedCoupon && quote && !quote.coupon_ok && <p className="field-error">{t("cart.couponInvalid")}</p>}
              </form>
            </>
          ) : (
            <dl className="quote">
              <div className="total"><dt>{t("cart.subtotal")}</dt><dd>{formatInr(estimate, lang)}</dd></div>
              <p className="small-print">{t("cart.guestNote")}</p>
            </dl>
          )}
          <Button
            className="btn-block"
            disabled={unavailable.length > 0}
            onClick={() => navigate(appliedCoupon && quote?.coupon_ok ? `/checkout?coupon=${encodeURIComponent(appliedCoupon)}` : "/checkout")}
          >
            {t("cart.checkout")}
          </Button>
          {unavailable.length > 0 && <p className="small-print">{t("cart.fixItems")}</p>}
        </aside>
      </div>
    </section>
  );
}
