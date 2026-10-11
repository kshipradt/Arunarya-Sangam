import { useI18n, type MessageKey } from "@/i18n/I18nProvider";
import type { PasswordCheck, PasswordRule } from "@/lib/security/password";

const RULES: PasswordRule[] = ["length", "lower", "upper", "digit", "symbol", "notCommon", "notEmail"];

/** Live checklist + strength bar. Announced politely to screen readers. */
export function PasswordStrength({ check, touched }: { check: PasswordCheck; touched: boolean }) {
  const { t } = useI18n();
  const level = t(`pw.level${check.score}` as MessageKey);
  return (
    <div className="pw-strength" aria-live="polite">
      <div className={`pw-meter pw-score-${check.score}`} aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={i < check.score ? "on" : ""} />
        ))}
      </div>
      {touched && <p className="pw-level">{t("pw.strength", { level })}</p>}
      <p className="pw-rules-title">{t("pw.rulesTitle")}</p>
      <ul className="pw-rules">
        {RULES.map((r) => (
          <li key={r} className={check.rules[r] ? "ok" : ""}>
            <span aria-hidden="true">{check.rules[r] ? "✓" : "•"}</span> {t(`pw.rule.${r}` as MessageKey)}
          </li>
        ))}
      </ul>
      <p className="field-hint">{t("pw.tip")}</p>
    </div>
  );
}
