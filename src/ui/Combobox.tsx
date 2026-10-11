/**
 * Searchable single-select (WAI-ARIA combobox pattern). Built for long lists
 * such as 250 countries or 4,000+ Indian cities: type to filter, arrow keys
 * to move, Enter to choose, Escape to close.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";

export type Option<V extends string | number> = { value: V; label: string; hint?: string };

const MAX_SHOWN = 80;

export function normalise(s: string): string {
  return s.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

export function filterOptions<V extends string | number>(options: Option<V>[], query: string): Option<V>[] {
  const q = normalise(query);
  if (!q) return options.slice(0, MAX_SHOWN);
  const starts: Option<V>[] = [];
  const contains: Option<V>[] = [];
  for (const o of options) {
    const label = normalise(o.label + " " + (o.hint ?? ""));
    if (label.startsWith(q)) starts.push(o);
    else if (label.includes(q)) contains.push(o);
    if (starts.length >= MAX_SHOWN) break;
  }
  return [...starts, ...contains].slice(0, MAX_SHOWN);
}

export function Combobox<V extends string | number>({
  label,
  options,
  value,
  onChange,
  error,
  hint,
  disabled,
  loading,
}: {
  label: string;
  options: Option<V>[];
  value: V | null;
  onChange: (v: V | null) => void;
  error?: string | null;
  hint?: string;
  disabled?: boolean;
  loading?: boolean;
}) {
  const { t } = useI18n();
  const id = useId();
  const listId = `${id}-list`;
  const selected = options.find((o) => o.value === value) ?? null;
  const [query, setQuery] = useState(selected?.label ?? "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => setQuery(selected?.label ?? ""), [selected?.label]);

  const shown = useMemo(() => filterOptions(options, open && query !== selected?.label ? query : ""), [options, query, open, selected?.label]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const choose = (o: Option<V>) => {
    onChange(o.value);
    setQuery(o.label);
    setOpen(false);
  };

  return (
    <div className={`field combobox ${error ? "field-invalid" : ""}`}>
      <label htmlFor={id}>{label}</label>
      {hint && <p id={`${id}-hint`} className="field-hint">{hint}</p>}
      <div className="field-control">
        <input
          id={id}
          role="combobox"
          autoComplete="off"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && shown[active] ? `${id}-opt-${active}` : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={[hint ? `${id}-hint` : "", error ? `${id}-err` : ""].filter(Boolean).join(" ") || undefined}
          placeholder={loading ? t("common.loading") : t("common.search")}
          disabled={disabled || loading}
          value={query}
          onFocus={(e) => {
            setOpen(true);
            e.currentTarget.select();
          }}
          onBlur={() => setTimeout(() => {
            setOpen(false);
            setQuery(selected?.label ?? "");
          }, 120)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(0);
            if (!e.target.value) onChange(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setActive((a) => Math.min(a + 1, shown.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && open && shown[active]) {
              e.preventDefault();
              choose(shown[active]!);
            } else if (e.key === "Escape") {
              setOpen(false);
              setQuery(selected?.label ?? "");
            }
          }}
        />
      </div>
      {open && !disabled && (
        <ul id={listId} ref={listRef} role="listbox" className="combobox-list" aria-label={label}>
          {shown.length === 0 && <li className="combobox-empty">{t("common.noResults")}</li>}
          {shown.map((o, i) => (
            <li
              key={String(o.value)}
              id={`${id}-opt-${i}`}
              data-index={i}
              role="option"
              aria-selected={o.value === value}
              className={i === active ? "is-active" : undefined}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(o);
              }}
              onMouseEnter={() => setActive(i)}
            >
              <span>{o.label}</span>
              {o.hint && <span className="combobox-hint">{o.hint}</span>}
            </li>
          ))}
        </ul>
      )}
      {error && <p id={`${id}-err`} className="field-error" role="alert">{error}</p>}
    </div>
  );
}
