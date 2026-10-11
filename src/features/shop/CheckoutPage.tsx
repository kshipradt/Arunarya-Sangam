/**
 * Checkout: delivery address in India, payment method, and the final
 * server-computed total. Cash on delivery works now; online payments switch
 * on in Phase 3 once the payment gateway account is open.
 */
import { useEffect, useState, type FormEvent } from "react";
import { useI18n, type MessageKey } from "@/i18n/I18nProvider";
import { errorMessageKey } from "@/lib/api/errors";
import { useAuth } from "@/lib/auth/AuthProvider";
import { normaliseIndianMobile, PINCODE_RE } from "@/lib/format";
import { Link, navigate, useLocation } from "@/lib/router";
import { Alert, Button, PageSpinner, TextField } from "@/ui/controls";
import { getStates, type Region } from "@/features/location/api";
import { placeOrder, quoteCart, type Address, type Quote } from "./api";
import { useCart } from "./CartProvider";
import { QuoteSummary } from "./CartPage";
import { EmptyState } from "./ui";

const ADDRESS_KEY = "sangam.lastAddress";
type Field = keyof Address;

function savedAddress(): Partial<Address> {
  try {
    return JSON.parse(localStorage.getItem(ADDRESS_KEY) ?? "{}") as Partial<Address>;
  } catch {
    return {};
  }
}

export function validateAddress(a: Address): Partial<Record<Field, MessageKey>> {
  const e: Partial<Record<Field, MessageKey>> = {};
  if (a.name.trim().length < 2) e.name = "v.name";
  if (!normaliseIndianMobile(a.phone)) e.phone = "checkout.phoneInvalid";
  if (a.line1.trim().length < 5) e.line1 = "checkout.addressShort";
  if (a.city.trim().length < 2) e.city = "loc.needCity";
  if (!a.state) e.state = "loc.needState";
  if (!PINCODE_RE.test(a.pincode.trim())) e.pincode = "checkout.pincodeInvalid";
  return e;
}

export function CheckoutPage() {
  const { t } = useI18n();
  const { profile, getAccessToken } = useAuth();
  const { lines, ready, revision, reload } = useCart();
  const [states, setStates] = useState<Region[]>([]);
  const [address, setAddress] = useState<Address>(() => ({
    name: profile?.full_name ?? "", phone: "", line1: "", line2: "", city: profile?.city_name ?? "", state: "", pincode: "",
    ...savedAddress(),
  }));
  const [quote, setQuote] = useState<Quote | null>(null);
  const [errors, setErrors] = useState<Partial<Record<Field, MessageKey>>>({});
  const [formError, setFormError] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);
  const { search } = useLocation();
  const coupon = search.get("coupon")?.trim().toUpperCase() || null;

  useEffect(() => void getStates(101).then(setStates).catch(() => {}), []);
  // Re-quote only once the account cart in the database is up to date.
  const hasLines = lines.length > 0;
  useEffect(() => {
    if (!ready || !hasLines) return;
    let live = true;
    getAccessToken()
      .then((tok) => quoteCart(coupon, tok))
      .then((q) => live && setQuote(q))
      .catch((e) => live && setFormError(errorMessageKey(e)));
    return () => {
      live = false;
    };
  }, [ready, hasLines, revision, getAccessToken, coupon]);

  if (!ready) return <PageSpinner />;
  if (!lines.length) {
    return (
      <section className="container narrow page-pad">
        <EmptyState title={t("cart.empty")}><Link to="/shop" className="btn btn-primary">{t("cart.startShopping")}</Link></EmptyState>
      </section>
    );
  }

  const set = (k: Field) => (e: { target: { value: string } }) => setAddress((a) => ({ ...a, [k]: e.target.value }));
  const err = (k: Field) => (errors[k] ? t(errors[k]!) : null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const errs = validateAddress(address);
    setErrors(errs);
    if (Object.keys(errs).length) {
      setFormError("v.fixErrors");
      return;
    }
    setBusy(true);
    setFormError(null);
    const clean: Address = {
      ...address,
      name: address.name.trim(),
      phone: normaliseIndianMobile(address.phone)!,
      line1: address.line1.trim(),
      line2: address.line2?.trim() || undefined,
      city: address.city.trim(),
      pincode: address.pincode.trim(),
    };
    try {
      const orderId = await placeOrder(clean, "cod", quote?.coupon_ok ? coupon : null, await getAccessToken());
      try {
        localStorage.setItem(ADDRESS_KEY, JSON.stringify(clean));
      } catch {
        /* optional convenience */
      }
      await reload();
      navigate(`/orders/${orderId}?placed=1`, { replace: true });
    } catch (err) {
      setFormError(errorMessageKey(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="container page-pad checkout">
      <h1>{t("checkout.title")}</h1>
      <form onSubmit={onSubmit} noValidate className="checkout-layout">
        <div>
          {formError && <Alert>{t(formError)}</Alert>}
          <fieldset className="card">
            <legend>{t("checkout.deliverTo")}</legend>
            <p className="small-print">{t("checkout.indiaOnly")}</p>
            <TextField label={t("field.fullName")} autoComplete="name" value={address.name} error={err("name")} onChange={set("name")} />
            <TextField label={t("checkout.mobile")} type="tel" inputMode="tel" autoComplete="tel-national" value={address.phone} error={err("phone")} onChange={set("phone")} hint={t("checkout.mobileHint")} />
            <TextField label={t("checkout.line1")} autoComplete="address-line1" value={address.line1} error={err("line1")} onChange={set("line1")} />
            <TextField label={t("checkout.line2")} optional autoComplete="address-line2" value={address.line2 ?? ""} onChange={set("line2")} />
            <TextField label={t("profile.city")} autoComplete="address-level2" value={address.city} error={err("city")} onChange={set("city")} />
            <label className={`field ${errors.state ? "field-invalid" : ""}`}>
              <span>{t("profile.state")}</span>
              <select value={address.state} onChange={set("state")} autoComplete="address-level1">
                <option value="">{t("common.select")}</option>
                {states.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
              {errors.state && <span className="field-error" role="alert">{t(errors.state)}</span>}
            </label>
            <TextField label={t("checkout.pincode")} inputMode="numeric" autoComplete="postal-code" maxLength={6} value={address.pincode} error={err("pincode")} onChange={set("pincode")} />
          </fieldset>

          <fieldset className="card payment-methods">
            <legend>{t("checkout.payment")}</legend>
            <label className="radio-row is-selected">
              <input type="radio" name="pay" defaultChecked /> <span><strong>{t("checkout.cod")}</strong><br /><span className="small-print">{t("checkout.codHint")}</span></span>
            </label>
            {(["checkout.upi", "checkout.card", "checkout.netbanking"] as MessageKey[]).map((k) => (
              <label key={k} className="radio-row is-disabled">
                <input type="radio" name="pay" disabled /> <span>{t(k)} <span className="badge">{t("checkout.soon")}</span></span>
              </label>
            ))}
          </fieldset>
        </div>

        <aside className="cart-summary">
          <h2>{t("checkout.summary")}</h2>
          {quote ? <QuoteSummary quote={quote} coupon={coupon} /> : <PageSpinner />}
          <Button type="submit" busy={busy} className="btn-block">{t("checkout.placeOrder")}</Button>
          <p className="small-print">{t("checkout.terms")}</p>
          <Link to="/cart">{t("checkout.backToCart")}</Link>
        </aside>
      </form>
    </section>
  );
}
