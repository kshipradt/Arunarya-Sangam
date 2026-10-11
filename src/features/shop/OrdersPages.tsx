import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useI18n, type MessageKey } from "@/i18n/I18nProvider";
import { errorMessageKey } from "@/lib/api/errors";
import { useAuth } from "@/lib/auth/AuthProvider";
import { formatDate, formatInr } from "@/lib/format";
import { Link, useLocation } from "@/lib/router";
import { Alert, Button, PageSpinner } from "@/ui/controls";
import { NotFoundPage } from "@/features/home/HomePage";
import { cancelOrder, getOrder, listMyOrders, submitReview, type Order, type OrderItem } from "./api";
import { QuoteSummary } from "./CartPage";
import { EmptyState, OrderStatusBadge } from "./ui";

const STEPS = ["placed", "confirmed", "shipped", "delivered"] as const;

export function OrdersPage() {
  const { t, lang } = useI18n();
  const { session, getAccessToken } = useAuth();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);

  useEffect(() => {
    if (!session) return;
    getAccessToken()
      .then((tok) => listMyOrders(session.user.id, tok))
      .then(setOrders)
      .catch((e) => (setError(errorMessageKey(e)), setOrders([])));
  }, [session, getAccessToken]);

  if (!orders) return <PageSpinner />;
  return (
    <section className="container narrow page-pad">
      <h1>{t("orders.title")}</h1>
      {error && <Alert>{t(error)}</Alert>}
      {orders.length === 0 ? (
        <EmptyState title={t("orders.none")}><Link to="/shop" className="btn btn-primary">{t("cart.startShopping")}</Link></EmptyState>
      ) : (
        <ul className="order-list" role="list">
          {orders.map((o) => (
            <li key={o.id}>
              <Link to={`/orders/${o.id}`} className="order-row">
                <span>
                  <strong>{t("orders.number", { number: o.id.slice(0, 8).toUpperCase() })}</strong>
                  <span className="small-print"> · {formatDate(o.created_at, lang)}</span>
                  <br />
                  <span className="small-print">{o.order_items.map((i) => i.title).join(", ")}</span>
                </span>
                <span className="order-row-end">
                  <OrderStatusBadge status={o.status} />
                  <strong>{formatInr(o.total_inr, lang)}</strong>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ReviewForm({ item, onDone }: { item: OrderItem; onDone: () => void }) {
  const { t } = useI18n();
  const { getAccessToken } = useAuth();
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!rating) return setError("review.pickStars");
    setBusy(true);
    try {
      await submitReview(item.id, rating, title, body, await getAccessToken());
      onDone();
    } catch (err) {
      setError(errorMessageKey(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="review-form" onSubmit={onSubmit}>
      <fieldset>
        <legend>{t("review.rate", { product: item.title })}</legend>
        <div className="star-picker">
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className={n <= rating ? "on" : ""}>
              <input type="radio" name={`stars-${item.id}`} value={n} checked={rating === n} onChange={() => setRating(n)} />
              <span aria-hidden="true">★</span>
              <span className="sr-only">{t("review.stars", { count: n })}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="field"><span>{t("review.headline")} <span className="optional">({t("common.optional")})</span></span>
        <input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="field"><span>{t("review.body")} <span className="optional">({t("common.optional")})</span></span>
        <textarea value={body} maxLength={2000} rows={3} onChange={(e) => setBody(e.target.value)} />
      </label>
      {error && <p className="field-error" role="alert">{t(error)}</p>}
      <Button type="submit" variant="secondary" busy={busy}>{t("review.submit")}</Button>
    </form>
  );
}

export function OrderPage({ id }: { id: string }) {
  const { t, lang } = useI18n();
  const { getAccessToken } = useAuth();
  const { search } = useLocation();
  const [order, setOrder] = useState<Order | null | undefined>(undefined);
  const [error, setError] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [thanks, setThanks] = useState(false);

  const load = useCallback(
    () => getAccessToken().then((tok) => getOrder(id, tok)).then(setOrder).catch(() => setOrder(null)),
    [id, getAccessToken],
  );
  useEffect(() => void load(), [load]);

  if (order === undefined) return <PageSpinner />;
  if (order === null) return <NotFoundPage />;
  const stepIndex = STEPS.indexOf(order.status as (typeof STEPS)[number]);

  return (
    <section className="container narrow page-pad order-page">
      {search.get("placed") && <Alert tone="success">{t("orders.placed")}</Alert>}
      {thanks && <Alert tone="success">{t("review.thanks")}</Alert>}
      {error && <Alert>{t(error)}</Alert>}
      <h1>{t("orders.number", { number: order.id.slice(0, 8).toUpperCase() })}</h1>
      <p className="small-print">{formatDate(order.created_at, lang)} · {order.payment_method === "cod" ? t("checkout.cod") : order.payment_method}</p>

      {order.status === "cancelled" ? (
        <p><OrderStatusBadge status="cancelled" /></p>
      ) : (
        <ol className="tracker" aria-label={t("orders.progress")}>
          {STEPS.map((s, i) => (
            <li key={s} className={i <= stepIndex ? "done" : ""} aria-current={i === stepIndex ? "step" : undefined}>
              {t(`status.${s}` as MessageKey)}
            </li>
          ))}
        </ol>
      )}

      <h2>{t("orders.items")}</h2>
      <ul className="order-items" role="list">
        {order.order_items.map((it) => (
          <li key={it.id}>
            <div className="order-item-row">
              <span>
                {it.product_id ? <Link to={`/product/${it.product_id}`}>{it.title}</Link> : it.title}
                <span className="small-print"> × {it.qty}</span>
              </span>
              <span>
                <OrderStatusBadge status={it.status} /> {formatInr(Number(it.unit_price_inr) * it.qty, lang)}
              </span>
            </div>
            {it.status === "delivered" && it.review.length === 0 && (
              <ReviewForm item={it} onDone={() => { setThanks(true); void load(); }} />
            )}
            {it.review.length > 0 && <p className="small-print">{t("review.yours", { stars: it.review[0]!.rating })}</p>}
          </li>
        ))}
      </ul>

      <h2>{t("checkout.summary")}</h2>
      <QuoteSummary
        quote={{
          subtotal: order.subtotal_inr,
          standing_discount: order.standing_discount_inr,
          coupon_discount: order.coupon_discount_inr,
          shipping: order.shipping_inr,
          total: order.total_inr,
          coupon_ok: !!order.coupon_code,
        }}
        coupon={order.coupon_code}
      />

      <h2>{t("checkout.deliverTo")}</h2>
      <address className="address">
        {order.address.name}<br />
        {order.address.line1}{order.address.line2 ? <>, {order.address.line2}</> : null}<br />
        {order.address.city}, {order.address.state} {order.address.pincode}<br />
        {order.address.phone}
      </address>

      <div className="row-actions">
        {order.status === "placed" && (
          <Button
            variant="secondary"
            busy={busy}
            onClick={async () => {
              if (!window.confirm(t("orders.cancelConfirm"))) return;
              setBusy(true);
              try {
                await cancelOrder(order.id, await getAccessToken());
                await load();
              } catch (e) {
                setError(errorMessageKey(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {t("orders.cancel")}
          </Button>
        )}
        <Link to={`/help/new?order=${order.id}`} className="btn btn-ghost">{t("help.raise")}</Link>
      </div>
    </section>
  );
}
