/**
 * Shared form controls. Every field has a visible label, connects its hint
 * and error text to the input for screen readers, and marks invalid state.
 */
import { useId, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { useI18n } from "@/i18n/I18nProvider";

export function Button({
  variant = "primary",
  busy = false,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost"; busy?: boolean }) {
  return (
    <button {...rest} className={`btn btn-${variant} ${rest.className ?? ""}`} disabled={rest.disabled || busy} aria-busy={busy || undefined}>
      {busy && <span className="spinner" aria-hidden="true" />}
      <span>{children}</span>
    </button>
  );
}

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  suffix?: ReactNode;
  optional?: boolean;
};

export function TextField({ label, hint, error, suffix, optional, id, ...input }: FieldProps) {
  const { t } = useI18n();
  const auto = useId();
  const fieldId = id ?? auto;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  return (
    <div className={`field ${error ? "field-invalid" : ""}`}>
      <label htmlFor={fieldId}>
        {label}
        {optional && <span className="optional"> ({t("common.optional")})</span>}
      </label>
      {hint && <p id={hintId} className="field-hint">{hint}</p>}
      <div className="field-control">
        <input
          id={fieldId}
          aria-invalid={error ? true : undefined}
          aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
          {...input}
        />
        {suffix}
      </div>
      {error && (
        <p id={errorId} className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function PasswordField(props: Omit<FieldProps, "type" | "suffix">) {
  const { t } = useI18n();
  const [shown, setShown] = useState(false);
  return (
    <TextField
      {...props}
      type={shown ? "text" : "password"}
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      suffix={
        <button
          type="button"
          className="field-toggle"
          aria-pressed={shown}
          aria-label={shown ? t("field.hidePassword") : t("field.showPassword")}
          onClick={() => setShown((s) => !s)}
        >
          {shown ? t("field.hidePassword") : t("field.showPassword")}
        </button>
      }
    />
  );
}

export function Alert({ tone = "error", children }: { tone?: "error" | "success" | "info"; children: ReactNode }) {
  return (
    <div className={`alert alert-${tone}`} role={tone === "error" ? "alert" : "status"}>
      {children}
    </div>
  );
}

export function Checkbox({
  checked,
  onChange,
  children,
  error,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
  error?: string | null;
}) {
  const id = useId();
  return (
    <div className={`field ${error ? "field-invalid" : ""}`}>
      <div className="checkbox">
        <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-err` : undefined} />
        <label htmlFor={id}>{children}</label>
      </div>
      {error && <p id={`${id}-err`} className="field-error" role="alert">{error}</p>}
    </div>
  );
}

export function RadioCards<T extends string>({
  legend,
  value,
  onChange,
  options,
}: {
  legend: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; title: string; description?: string }[];
}) {
  const name = useId();
  return (
    <fieldset className="radio-cards">
      <legend>{legend}</legend>
      <div className="radio-cards-grid">
        {options.map((o) => (
          <label key={o.value} className={`radio-card ${value === o.value ? "is-selected" : ""}`}>
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
            <span className="radio-card-title">{o.title}</span>
            {o.description && <span className="radio-card-desc">{o.description}</span>}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function PageSpinner() {
  const { t } = useI18n();
  return (
    <div className="page-spinner" role="status">
      <span className="spinner" aria-hidden="true" />
      <span>{t("common.loading")}</span>
    </div>
  );
}
