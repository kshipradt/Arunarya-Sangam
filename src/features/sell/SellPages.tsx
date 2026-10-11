/**
 * Seller workspace: dashboard, verification, product form with photos,
 * and orders to fulfil. Open to artisans, business owners and traders.
 */
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useI18n, type MessageKey } from "@/i18n/I18nProvider";
import { errorMessageKey } from "@/lib/api/errors";
import { useAuth } from "@/lib/auth/AuthProvider";
import { isSellerRole } from "@/lib/domain/roles";
import { formatDate, formatInr, GSTIN_RE, normaliseIndianMobile, PINCODE_RE } from "@/lib/format";
import { Link, navigate, useLocation } from "@/lib/router";
import { Alert, Button, Checkbox, PageSpinner, TextField } from "@/ui/controls";
import { CATEGORIES } from "@/features/shop/api";
import { EmptyState, OrderStatusBadge, useCategoryLabel } from "@/features/shop/ui";
import {
  getMyProduct, getMyVerification, listMyProducts, listOdopProductsForDistrict, listSellerOrderItems, MAX_PHOTOS, NEXT_STATUS,
  saveProduct, saveVerification, setItemStatus, uploadProductPhoto,
  type MyProduct, type OdopOption, type ProductInput, type SellerOrderItem, type Verification,
} from "./api";

export function RequireSeller({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { profile } = useAuth();
  if (profile && !isSellerRole(profile.role)) {
    return (
      <section className="container narrow page-pad">
        <h1>{t("sell.title")}</h1>
        <p>{t("sell.buyersOnly")}</p>
        <Link to="/account/complete-profile" className="btn btn-secondary">{t("account.edit")}</Link>
      </section>
    );
  }
  return <>{children}</>;
}

function VerificationBanner({ v }: { v: Verification | null }) {
  const { t } = useI18n();
  if (!v) return <Alert tone="info">{t("sell.verifyFirst")} <Link to="/sell/verify">{t("sell.verifyNow")}</Link></Alert>;
  if (v.status === "pending") return <Alert tone="info">{t("sell.verifyPending")}</Alert>;
  if (v.status === "rejected") return <Alert>{t("sell.verifyRejected")} {v.review_note && <em>“{v.review_note}”</em>} <Link to="/sell/verify">{t("sell.verifyFix")}</Link></Alert>;
  return <Alert tone="success">{t("sell.verified")}</Alert>;
}

export function SellDashboard() {
  const { t, lang } = useI18n();
  const { session, getAccessToken } = useAuth();
  const { search } = useLocation();
  const [v, setV] = useState<Verification | null | undefined>(undefined);
  const [products, setProducts] = useState<MyProduct[] | null>(null);

  useEffect(() => {
    if (!session) return;
    getAccessToken().then(async (tok) => {
      const [ver, prods] = await Promise.all([getMyVerification(session.user.id, tok), listMyProducts(session.user.id, tok)]);
      setV(ver);
      setProducts(prods);
    }).catch(() => (setV(null), setProducts([])));
  }, [session, getAccessToken]);

  if (v === undefined || !products) return <PageSpinner />;
  return (
    <section className="container page-pad">
      {search.get("saved") && <Alert tone="success">{t("sell.savedProduct")}</Alert>}
      {search.get("submitted") && <Alert tone="success">{t("sell.verifySubmitted")}</Alert>}
      <div className="page-head">
        <h1>{t("sell.title")}</h1>
        <div className="row-actions">
          <Link to="/sell/products/new" className="btn btn-primary">{t("sell.addProduct")}</Link>
          <Link to="/sell/orders" className="btn btn-secondary">{t("sell.orders")}</Link>
        </div>
      </div>
      <VerificationBanner v={v} />
      <h2>{t("sell.myProducts")}</h2>
      {products.length === 0 ? (
        <EmptyState title={t("sell.noProducts")}><p>{t("sell.noProductsHint")}</p></EmptyState>
      ) : (
        <ul className="seller-products" role="list">
          {products.map((p) => (
            <li key={p.id}>
              <Link to={`/sell/products/${p.id}`} className="seller-product-row">
                {p.image_urls[0] ? <img src={p.image_urls[0]} alt="" width={64} height={64} /> : <div className="img-placeholder small" aria-hidden="true" />}
                <span className="grow">
                  <strong>{p.title}</strong><br />
                  <span className="small-print">{formatInr(p.price_inr, lang)} · {t("sell.stockN", { count: p.stock })} · {formatDate(p.updated_at, lang)}</span>
                  {p.blocked && <><br /><span className="field-error">{t("sell.blocked")} {p.blocked_reason}</span></>}
                </span>
                <span className={`status status-${p.status}`}>{t(`sell.status.${p.status}` as MessageKey)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function VerificationPage() {
  const { t } = useI18n();
  const { session, getAccessToken } = useAuth();
  const [existing, setExisting] = useState<Verification | null | undefined>(undefined);
  const [form, setForm] = useState({ legal_name: "", business_address: "", pincode: "", customer_care_phone: "", gstin: "" });
  const [errors, setErrors] = useState<Partial<Record<keyof typeof form, MessageKey>>>({});
  const [formError, setFormError] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!session) return;
    getAccessToken().then((tok) => getMyVerification(session.user.id, tok)).then((v) => {
      setExisting(v);
      if (v) setForm({ legal_name: v.legal_name, business_address: v.business_address, pincode: v.pincode ?? "", customer_care_phone: v.customer_care_phone, gstin: v.gstin ?? "" });
    }).catch(() => setExisting(null));
  }, [session, getAccessToken]);

  if (existing === undefined) return <PageSpinner />;
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const errs: typeof errors = {};
    if (form.legal_name.trim().length < 2) errs.legal_name = "v.required";
    if (form.business_address.trim().length < 10) errs.business_address = "checkout.addressShort";
    if (form.pincode && !PINCODE_RE.test(form.pincode.trim())) errs.pincode = "checkout.pincodeInvalid";
    if (!normaliseIndianMobile(form.customer_care_phone) && !/^\+[1-9][0-9 -]{7,15}$/.test(form.customer_care_phone.trim())) errs.customer_care_phone = "checkout.phoneInvalid";
    if (form.gstin && !GSTIN_RE.test(form.gstin.trim().toUpperCase())) errs.gstin = "sell.gstinInvalid";
    setErrors(errs);
    if (Object.keys(errs).length) return setFormError("v.fixErrors");
    setBusy(true);
    setFormError(null);
    try {
      const phone = normaliseIndianMobile(form.customer_care_phone);
      await saveVerification(session!.user.id, {
        legal_name: form.legal_name.trim(),
        business_address: form.business_address.trim(),
        pincode: form.pincode.trim() || null,
        customer_care_phone: phone ? `+91 ${phone}` : form.customer_care_phone.trim(),
        gstin: form.gstin.trim().toUpperCase() || null,
      }, !!existing, await getAccessToken());
      navigate("/sell?submitted=1", { replace: true });
    } catch (err) {
      setFormError(errorMessageKey(err));
    } finally {
      setBusy(false);
    }
  }

  const err = (k: keyof typeof form) => (errors[k] ? t(errors[k]!) : null);
  return (
    <section className="container narrow page-pad">
      <h1>{t("sell.verifyTitle")}</h1>
      <p className="lead">{t("sell.verifyLead")}</p>
      <form onSubmit={onSubmit} noValidate>
        {formError && <Alert>{t(formError)}</Alert>}
        <TextField label={t("seller.legalName")} hint={t("sell.legalNameHint")} value={form.legal_name} maxLength={160} error={err("legal_name")} onChange={set("legal_name")} />
        <label className={`field ${errors.business_address ? "field-invalid" : ""}`}>
          <span>{t("seller.address")}</span>
          <textarea rows={3} maxLength={400} value={form.business_address} onChange={set("business_address")} aria-invalid={errors.business_address ? true : undefined} />
          {errors.business_address && <span className="field-error" role="alert">{t(errors.business_address)}</span>}
        </label>
        <TextField label={t("checkout.pincode")} optional inputMode="numeric" maxLength={6} value={form.pincode} error={err("pincode")} onChange={set("pincode")} />
        <TextField label={t("seller.customerCare")} hint={t("sell.customerCareHint")} type="tel" value={form.customer_care_phone} error={err("customer_care_phone")} onChange={set("customer_care_phone")} />
        <TextField label={t("sell.gstin")} optional hint={t("sell.gstinHint")} autoCapitalize="characters" maxLength={15} value={form.gstin} error={err("gstin")} onChange={set("gstin")} />
        <p className="small-print">{t("sell.verifyPrivacy")}</p>
        <Button type="submit" busy={busy} className="btn-block">{existing ? t("sell.verifyUpdate") : t("sell.verifySubmit")}</Button>
      </form>
    </section>
  );
}

const EMPTY_PRODUCT: ProductInput = {
  title: "", description: "", price_inr: 0, mrp_inr: null, stock: 1, unit: "piece", image_urls: [],
  gi_tagged: false, status: "draft", category: null, odop_product_id: null, country_of_origin: "India",
};

export function validateProduct(p: ProductInput, publishing: boolean): Partial<Record<keyof ProductInput, MessageKey>> {
  const e: Partial<Record<keyof ProductInput, MessageKey>> = {};
  if (p.title.trim().length < 3) e.title = "sell.titleShort";
  if (!(p.price_inr > 0)) e.price_inr = "sell.priceInvalid";
  if (p.mrp_inr !== null && p.mrp_inr < p.price_inr) e.mrp_inr = "sell.mrpBelowPrice";
  if (!Number.isInteger(p.stock) || p.stock < 0) e.stock = "sell.stockInvalid";
  if (!p.category) e.category = "v.required";
  if (publishing && p.image_urls.length === 0) e.image_urls = "sell.needPhoto";
  return e;
}

export function ProductFormPage({ id }: { id: string | null }) {
  const { t } = useI18n();
  const categoryLabel = useCategoryLabel();
  const { session, profile, getAccessToken } = useAuth();
  const [values, setValues] = useState<ProductInput | null>(id ? null : EMPTY_PRODUCT);
  const [odop, setOdop] = useState<OdopOption[]>([]);
  const [errors, setErrors] = useState<Partial<Record<keyof ProductInput, MessageKey>>>({});
  const [formError, setFormError] = useState<MessageKey | null>(null);
  const [uploading, setUploading] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    getAccessToken().then((tok) => getMyProduct(id, tok)).then((p) => setValues(p ? { ...EMPTY_PRODUCT, ...p } : EMPTY_PRODUCT)).catch(() => setValues(EMPTY_PRODUCT));
  }, [id, getAccessToken]);
  useEffect(() => {
    if (profile?.district_id) listOdopProductsForDistrict(profile.district_id).then(setOdop).catch(() => {});
  }, [profile?.district_id]);

  if (!values || !session) return <PageSpinner />;
  const set = <K extends keyof ProductInput>(k: K, v: ProductInput[K]) => setValues((p) => ({ ...p!, [k]: v }));

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    const room = MAX_PHOTOS - values!.image_urls.length;
    const picked = Array.from(files).slice(0, room);
    setUploading(picked.length);
    setFormError(null);
    try {
      const tok = await getAccessToken();
      const urls: string[] = [];
      for (const f of picked) {
        urls.push(await uploadProductPhoto(session!.user.id, f, tok));
        setUploading((n) => n - 1);
      }
      setValues((p) => ({ ...p!, image_urls: [...p!.image_urls, ...urls] }));
    } catch (e) {
      setFormError((e as Error).message === "not_image" ? "sell.notImage" : errorMessageKey(e));
    } finally {
      setUploading(0);
    }
  }

  const movePhoto = (i: number, dir: -1 | 1) =>
    setValues((p) => {
      const arr = [...p!.image_urls];
      const j = i + dir;
      if (j < 0 || j >= arr.length) return p;
      [arr[i], arr[j]] = [arr[j]!, arr[i]!];
      return { ...p!, image_urls: arr };
    });

  async function save(status: ProductInput["status"]) {
    const next = { ...values!, status, title: values!.title.trim(), description: values!.description?.trim() || null };
    const errs = validateProduct(next, status === "active");
    setErrors(errs);
    if (Object.keys(errs).length) return setFormError("v.fixErrors");
    setBusy(true);
    setFormError(null);
    try {
      await saveProduct(session!.user.id, id, next, await getAccessToken());
      navigate("/sell?saved=1", { replace: true });
    } catch (e) {
      setFormError(errorMessageKey(e));
    } finally {
      setBusy(false);
    }
  }

  const err = (k: keyof ProductInput) => (errors[k] ? t(errors[k]!) : null);
  return (
    <section className="container narrow page-pad">
      <h1>{id ? t("sell.editProduct") : t("sell.addProduct")}</h1>
      <form onSubmit={(e) => { e.preventDefault(); void save("active"); }} noValidate className="stack">
        {formError && <Alert>{t(formError)}</Alert>}

        <fieldset className={`card ${errors.image_urls ? "field-invalid" : ""}`}>
          <legend>{t("sell.photos")}</legend>
          <p className="field-hint">{t("sell.photosHint", { max: MAX_PHOTOS })}</p>
          <ul className="photo-grid" role="list">
            {values.image_urls.map((src, i) => (
              <li key={src}>
                <img src={src} alt={t("shop.photoN", { n: i + 1 })} width={120} height={120} />
                {i === 0 && <span className="badge">{t("sell.cover")}</span>}
                <div className="photo-actions">
                  <button type="button" onClick={() => movePhoto(i, -1)} disabled={i === 0} aria-label={t("sell.moveEarlier")}>◀</button>
                  <button type="button" onClick={() => set("image_urls", values.image_urls.filter((u) => u !== src))} aria-label={t("sell.removePhoto")}>✕</button>
                  <button type="button" onClick={() => movePhoto(i, 1)} disabled={i === values.image_urls.length - 1} aria-label={t("sell.moveLater")}>▶</button>
                </div>
              </li>
            ))}
          </ul>
          {values.image_urls.length < MAX_PHOTOS && (
            <label className="btn btn-secondary file-btn">
              {uploading ? t("sell.uploading", { count: uploading }) : t("sell.addPhotos")}
              <input type="file" accept="image/*" multiple className="sr-only" disabled={uploading > 0} onChange={(e) => { void addPhotos(e.target.files); e.target.value = ""; }} />
            </label>
          )}
          {errors.image_urls && <p className="field-error" role="alert">{t(errors.image_urls)}</p>}
        </fieldset>

        <TextField label={t("sell.productTitle")} hint={t("sell.titleHint")} maxLength={120} value={values.title} error={err("title")} onChange={(e) => set("title", e.target.value)} />
        <label className="field">
          <span>{t("sell.description")}</span>
          <span className="field-hint">{t("sell.descriptionHint")}</span>
          <textarea rows={6} maxLength={2000} value={values.description ?? ""} onChange={(e) => set("description", e.target.value)} />
        </label>
        <label className={`field ${errors.category ? "field-invalid" : ""}`}>
          <span>{t("shop.category")}</span>
          <select value={values.category ?? ""} onChange={(e) => set("category", e.target.value || null)}>
            <option value="">{t("common.select")}</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{categoryLabel(c)}</option>)}
          </select>
          {errors.category && <span className="field-error" role="alert">{t(errors.category)}</span>}
        </label>
        {odop.length > 0 && (
          <label className="field">
            <span>{t("shop.odopProduct")}</span>
            <select value={values.odop_product_id ?? ""} onChange={(e) => set("odop_product_id", e.target.value || null)}>
              <option value="">{t("sell.notOdop")}</option>
              {odop.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </label>
        )}
        <div className="row-2">
          <TextField label={t("sell.price")} type="number" inputMode="decimal" min={1} value={values.price_inr || ""} error={err("price_inr")} onChange={(e) => set("price_inr", Number(e.target.value))} />
          <TextField label={t("sell.mrp")} optional type="number" inputMode="decimal" min={1} value={values.mrp_inr ?? ""} error={err("mrp_inr")} onChange={(e) => set("mrp_inr", e.target.value ? Number(e.target.value) : null)} />
        </div>
        <div className="row-2">
          <TextField label={t("sell.stock")} type="number" inputMode="numeric" min={0} value={values.stock} error={err("stock")} onChange={(e) => set("stock", Math.floor(Number(e.target.value)))} />
          <TextField label={t("shop.unit")} hint={t("sell.unitHint")} maxLength={30} value={values.unit} onChange={(e) => set("unit", e.target.value)} />
        </div>
        <Checkbox checked={values.gi_tagged} onChange={(v) => set("gi_tagged", v)}>{t("sell.giTagged")}</Checkbox>
        <p className="small-print">{t("sell.fairPrice")}</p>

        <div className="row-actions">
          <Button type="submit" busy={busy || uploading > 0}>{t("sell.publish")}</Button>
          <Button type="button" variant="secondary" busy={busy} onClick={() => void save("draft")}>{t("sell.saveDraft")}</Button>
          {id && values.status === "active" && <Button type="button" variant="ghost" busy={busy} onClick={() => void save("paused")}>{t("sell.pause")}</Button>}
        </div>
      </form>
    </section>
  );
}

export function SellerOrdersPage() {
  const { t, lang } = useI18n();
  const { session, getAccessToken } = useAuth();
  const [items, setItems] = useState<SellerOrderItem[] | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { search } = useLocation();
  const showAll = search.get("all") === "1";

  const load = useCallback(() => {
    if (!session) return;
    getAccessToken().then((tok) => listSellerOrderItems(session.user.id, tok)).then(setItems).catch((e) => (setError(errorMessageKey(e)), setItems([])));
  }, [session, getAccessToken]);
  useEffect(load, [load]);

  if (!items) return <PageSpinner />;
  const shown = showAll ? items : items.filter((i) => i.status !== "delivered" && i.status !== "cancelled");

  async function change(item: SellerOrderItem, status: SellerOrderItem["status"]) {
    if (status === "cancelled" && !window.confirm(t("sell.cancelConfirm"))) return;
    setBusyId(item.id);
    setError(null);
    try {
      await setItemStatus(item.id, status, await getAccessToken());
      load();
    } catch (e) {
      setError(errorMessageKey(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="container page-pad">
      <div className="page-head">
        <h1>{t("sell.orders")}</h1>
        <Link to={showAll ? "/sell/orders" : "/sell/orders?all=1"} className="btn btn-ghost">{showAll ? t("sell.showOpen") : t("sell.showAll")}</Link>
      </div>
      {error && <Alert>{t(error)}</Alert>}
      {shown.length === 0 ? (
        <EmptyState title={t("sell.noOrders")} />
      ) : (
        <ul className="seller-orders" role="list">
          {shown.map((it) => {
            const next = NEXT_STATUS[it.status];
            const a = it.order?.address;
            return (
              <li key={it.id} className="card">
                <div className="order-item-row">
                  <span><strong>{it.title}</strong> × {it.qty}<br /><span className="small-print">{it.order && formatDate(it.order.created_at, lang)} · {formatInr(Number(it.unit_price_inr) * it.qty, lang)} · {it.order?.payment_method === "cod" ? t("checkout.cod") : it.order?.payment_method}</span></span>
                  <OrderStatusBadge status={it.status} />
                </div>
                {a && it.status !== "cancelled" && (
                  <address className="address small-print">{a.name}, {a.line1}{a.line2 ? `, ${a.line2}` : ""}, {a.city}, {a.state} {a.pincode} · {a.phone}</address>
                )}
                <div className="row-actions">
                  {next && <Button busy={busyId === it.id} onClick={() => void change(it, next)}>{t(`sell.markAs.${next}` as MessageKey)}</Button>}
                  {(it.status === "placed" || it.status === "confirmed") && (
                    <Button variant="ghost" busy={busyId === it.id} onClick={() => void change(it, "cancelled")}>{t("sell.cancelItem")}</Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
