/**
 * The catalogue: search, filter by state, ODOP district, category, price and
 * GI tag, sort, and load more. Filters live in the address bar so a search
 * can be shared or bookmarked.
 */
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useI18n, type MessageKey } from "@/i18n/I18nProvider";
import { navigate, useLocation } from "@/lib/router";
import { Combobox } from "@/ui/Combobox";
import { Alert, Button, Checkbox, PageSpinner } from "@/ui/controls";
import { errorMessageKey } from "@/lib/api/errors";
import { getDistricts, getStates, type District, type Region } from "@/features/location/api";
import { CATEGORIES, searchProducts, type ProductCard, type SearchParams } from "./api";
import { EmptyState, ProductTile, useCategoryLabel } from "./ui";

const INDIA_COUNTRY_ID = 101;
const SORTS: NonNullable<SearchParams["sort"]>[] = ["relevance", "newest", "price_asc", "price_desc", "rating"];

function paramsFromUrl(search: URLSearchParams): SearchParams {
  const num = (k: string) => (search.get(k) ? Number(search.get(k)) : null);
  const sort = search.get("sort") as SearchParams["sort"];
  return {
    q: search.get("q") ?? "",
    state: num("state"),
    district: search.get("district"),
    category: search.get("category"),
    min: num("min"),
    max: num("max"),
    gi: search.get("gi") === "1",
    sort: sort && SORTS.includes(sort) ? sort : "relevance",
  };
}

function urlFromParams(p: SearchParams): string {
  const s = new URLSearchParams();
  if (p.q) s.set("q", p.q);
  if (p.state) s.set("state", String(p.state));
  if (p.district) s.set("district", p.district);
  if (p.category) s.set("category", p.category);
  if (p.min) s.set("min", String(p.min));
  if (p.max) s.set("max", String(p.max));
  if (p.gi) s.set("gi", "1");
  if (p.sort && p.sort !== "relevance") s.set("sort", p.sort);
  const qs = s.toString();
  return `/shop${qs ? `?${qs}` : ""}`;
}

export function ShopPage() {
  const { t } = useI18n();
  const categoryLabel = useCategoryLabel();
  const { search } = useLocation();
  const params = useMemo(() => paramsFromUrl(search), [search]);
  const [query, setQuery] = useState(params.q ?? "");
  const [items, setItems] = useState<ProductCard[] | null>(null);
  const [page, setPage] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  const [states, setStates] = useState<Region[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => void getStates(INDIA_COUNTRY_ID).then(setStates).catch(() => {}), []);
  useEffect(() => {
    if (params.state) getDistricts(params.state).then(setDistricts).catch(() => setDistricts([]));
    else setDistricts([]);
  }, [params.state]);

  useEffect(() => {
    let live = true;
    setItems(null);
    setPage(0);
    setError(null);
    searchProducts({ ...params, page: 0 })
      .then((rows) => live && setItems(rows))
      .catch((e) => live && (setError(errorMessageKey(e)), setItems([])));
    return () => {
      live = false;
    };
  }, [params]);

  const total = items?.[0]?.total_count ?? 0;
  const set = (patch: Partial<SearchParams>) => navigate(urlFromParams({ ...params, ...patch }), { replace: true });

  async function loadMore() {
    setLoadingMore(true);
    try {
      const next = await searchProducts({ ...params, page: page + 1 });
      setItems((prev) => [...(prev ?? []), ...next]);
      setPage((p) => p + 1);
    } catch (e) {
      setError(errorMessageKey(e));
    } finally {
      setLoadingMore(false);
    }
  }

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    set({ q: query.trim() });
  };

  const filters = (
    <div className="filters" id="shop-filters">
      <Combobox
        label={t("profile.state")}
        options={states.map((s) => ({ value: s.id, label: s.name }))}
        value={params.state ?? null}
        onChange={(v) => set({ state: v, district: null })}
      />
      {params.state && (
        <Combobox
          label={t("profile.district")}
          options={districts.map((d) => ({ value: d.id, label: d.name }))}
          value={params.district ?? null}
          onChange={(v) => set({ district: v })}
        />
      )}
      <label className="field">
        <span>{t("shop.category")}</span>
        <select value={params.category ?? ""} onChange={(e) => set({ category: e.target.value || null })}>
          <option value="">{t("shop.allCategories")}</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{categoryLabel(c)}</option>)}
        </select>
      </label>
      <fieldset className="price-range">
        <legend>{t("shop.priceRange")}</legend>
        <div className="row-2">
          <label><span className="sr-only">{t("shop.minPrice")}</span>
            <input type="number" inputMode="numeric" min={0} placeholder={t("shop.minPrice")} defaultValue={params.min ?? ""}
              onBlur={(e) => set({ min: e.target.value ? Number(e.target.value) : null })} />
          </label>
          <label><span className="sr-only">{t("shop.maxPrice")}</span>
            <input type="number" inputMode="numeric" min={0} placeholder={t("shop.maxPrice")} defaultValue={params.max ?? ""}
              onBlur={(e) => set({ max: e.target.value ? Number(e.target.value) : null })} />
          </label>
        </div>
      </fieldset>
      <Checkbox checked={!!params.gi} onChange={(v) => set({ gi: v })}>{t("shop.giOnly")}</Checkbox>
      <Button variant="ghost" onClick={() => { setQuery(""); navigate("/shop", { replace: true }); }}>{t("shop.clearFilters")}</Button>
    </div>
  );

  return (
    <section className="container page-pad shop">
      <h1>{t("shop.title")}</h1>
      <form className="search-bar" role="search" onSubmit={onSearch}>
        <label htmlFor="shop-q" className="sr-only">{t("shop.searchLabel")}</label>
        <input id="shop-q" type="search" value={query} placeholder={t("shop.searchPlaceholder")} onChange={(e) => setQuery(e.target.value)} />
        <Button type="submit">{t("shop.searchButton")}</Button>
      </form>

      <div className="shop-toolbar">
        <button type="button" className="btn btn-secondary filters-toggle" aria-expanded={filtersOpen} aria-controls="shop-filters" onClick={() => setFiltersOpen((o) => !o)}>
          {t("shop.filters")}
        </button>
        <label className="sort">
          <span>{t("shop.sortBy")}</span>
          <select value={params.sort} onChange={(e) => set({ sort: e.target.value as SearchParams["sort"] })}>
            {SORTS.map((s) => <option key={s} value={s}>{t(`shop.sort.${s}` as MessageKey)}</option>)}
          </select>
        </label>
      </div>

      <div className="shop-layout">
        <aside className={`shop-filters ${filtersOpen ? "is-open" : ""}`} aria-label={t("shop.filters")}>{filters}</aside>
        <div className="shop-results">
          {error && <Alert>{t(error)}</Alert>}
          {items === null ? (
            <PageSpinner />
          ) : items.length === 0 ? (
            <EmptyState title={t("shop.noResults")}>
              <p>{t("shop.noResultsHint")}</p>
            </EmptyState>
          ) : (
            <>
              <p className="result-count" aria-live="polite">{t("shop.resultCount", { count: total })}</p>
              <ul className="product-grid" role="list">
                {items.map((p) => <ProductTile key={p.id} p={p} />)}
              </ul>
              {items.length < total && (
                <div className="center">
                  <Button variant="secondary" busy={loadingMore} onClick={loadMore}>{t("shop.loadMore")}</Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
