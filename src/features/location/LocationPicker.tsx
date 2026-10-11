import { useEffect, useMemo, useState } from "react";
import { useI18n, type MessageKey } from "@/i18n/I18nProvider";
import { INDIA_ISO2, type LocationDraft, type LocationErrors } from "@/lib/domain/location";
import { isSellerRole, type UserRole } from "@/lib/domain/roles";
import { Combobox, type Option } from "@/ui/Combobox";
import { Checkbox, TextField } from "@/ui/controls";
import { getCities, getCountries, getDistricts, getStates, type City, type Country, type District, type Region } from "./api";

export type LocationValue = LocationDraft & { abroad: boolean };

export const EMPTY_LOCATION: LocationValue = {
  countryId: null, countryIso2: null, countryHasStates: true,
  stateId: null, cityId: null, cityName: "", districtId: null, abroad: false,
};

function useAsync<T>(load: (() => Promise<T>) | null, deps: unknown[]): { data: T | null; loading: boolean } {
  const [state, setState] = useState<{ data: T | null; loading: boolean }>({ data: null, loading: false });
  useEffect(() => {
    if (!load) {
      setState({ data: null, loading: false });
      return;
    }
    let live = true;
    setState((s) => ({ data: s.data, loading: true }));
    load()
      .then((data) => live && setState({ data, loading: false }))
      .catch(() => live && setState({ data: null, loading: false }));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

export function LocationPicker({
  role,
  value,
  onChange,
  errors,
}: {
  role: UserRole;
  value: LocationValue;
  onChange: (v: LocationValue) => void;
  errors: LocationErrors;
}) {
  const { t } = useI18n();
  const seller = isSellerRole(role);
  const countries = useAsync<Country[]>(getCountries, []);
  const india = countries.data?.find((c) => c.iso2 === INDIA_ISO2) ?? null;
  const sellerInIndia = seller && !value.abroad;

  // Sellers based in India: the country is India, fixed.
  useEffect(() => {
    if (sellerInIndia && india && value.countryId !== india.id) {
      onChange({ ...EMPTY_LOCATION, countryId: india.id, countryIso2: india.iso2 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellerInIndia, india?.id]);

  const states = useAsync<Region[]>(value.countryId ? () => getStates(value.countryId!) : null, [value.countryId]);
  const cities = useAsync<City[]>(value.stateId ? () => getCities(value.stateId!) : null, [value.stateId]);
  const districts = useAsync<District[]>(
    sellerInIndia && value.stateId ? () => getDistricts(value.stateId!) : null,
    [sellerInIndia, value.stateId],
  );

  useEffect(() => {
    if (states.data && value.countryHasStates !== states.data.length > 0) {
      onChange({ ...value, countryHasStates: states.data.length > 0 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [states.data]);

  const countryOptions = useMemo<Option<number>[]>(
    () =>
      (countries.data ?? [])
        .filter((c) => !(seller && value.abroad && c.iso2 === INDIA_ISO2))
        .map((c) => ({ value: c.id, label: `${c.emoji ?? ""} ${c.name}`.trim(), hint: c.native_name && c.native_name !== c.name ? c.native_name : undefined })),
    [countries.data, seller, value.abroad],
  );
  const stateOptions = useMemo(() => (states.data ?? []).map((s) => ({ value: s.id, label: s.name })), [states.data]);
  const cityOptions = useMemo(() => (cities.data ?? []).map((c) => ({ value: c.id, label: c.name })), [cities.data]);
  const districtOptions = useMemo(() => (districts.data ?? []).map((d) => ({ value: d.id, label: d.name })), [districts.data]);
  const [typingCity, setTypingCity] = useState(value.cityId === null && value.cityName !== "");

  const err = (k: keyof LocationErrors) => (errors[k] ? t(errors[k] as MessageKey) : null);
  const showCountry = !sellerInIndia;
  const showState = sellerInIndia || (value.countryId !== null && (stateOptions.length > 0 || states.loading));

  return (
    <fieldset className="location-picker">
      <legend>{t("profile.locationTitle")}</legend>

      {seller && (
        <Checkbox
          checked={value.abroad}
          onChange={(abroad) => {
            setTypingCity(false);
            onChange({ ...EMPTY_LOCATION, abroad });
          }}
        >
          {t("profile.abroad")}
        </Checkbox>
      )}

      {showCountry && (
        <Combobox
          label={t("profile.country")}
          options={countryOptions}
          loading={countries.loading}
          value={value.countryId}
          error={err("country")}
          onChange={(id) => {
            const c = countries.data?.find((x) => x.id === id) ?? null;
            setTypingCity(false);
            onChange({ ...EMPTY_LOCATION, abroad: value.abroad, countryId: c?.id ?? null, countryIso2: c?.iso2 ?? null });
          }}
        />
      )}

      {showState && (
        <Combobox
          label={t("profile.state")}
          options={stateOptions}
          loading={states.loading}
          value={value.stateId}
          error={err("state")}
          onChange={(id) => {
            setTypingCity(false);
            onChange({ ...value, stateId: id, cityId: null, cityName: "", districtId: null });
          }}
        />
      )}

      {sellerInIndia && value.stateId !== null && (
        <Combobox
          label={t("profile.district")}
          hint={t("profile.districtHint")}
          options={districtOptions}
          loading={districts.loading}
          value={value.districtId}
          error={err("district")}
          onChange={(id) => onChange({ ...value, districtId: id })}
        />
      )}

      {value.countryId !== null && (!showState || value.stateId !== null || !value.countryHasStates) && (
        <>
          {!typingCity && cityOptions.length > 0 ? (
            <Combobox
              label={t("profile.city")}
              options={cityOptions}
              loading={cities.loading}
              value={value.cityId}
              error={err("city")}
              onChange={(id) => onChange({ ...value, cityId: id, cityName: cityOptions.find((c) => c.value === id)?.label ?? "" })}
            />
          ) : (
            <TextField
              label={t("profile.cityTyped")}
              value={value.cityName}
              maxLength={100}
              autoComplete="address-level2"
              error={err("city")}
              onChange={(e) => onChange({ ...value, cityId: null, cityName: e.target.value })}
            />
          )}
          {cityOptions.length > 0 && (
            <Checkbox
              checked={typingCity}
              onChange={(v) => {
                setTypingCity(v);
                onChange({ ...value, cityId: null, cityName: "" });
              }}
            >
              {t("profile.cityMissing")}
            </Checkbox>
          )}
        </>
      )}
    </fieldset>
  );
}
