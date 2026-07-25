"use client";

import PhoneInput from "react-phone-number-input";
import type { Country } from "react-phone-number-input";
import "react-phone-number-input/style.css";

type Props = {
  value: string;
  onChange: (value: string) => void;
  defaultCountry: Country;
  onFocus?: () => void;
  onBlur?: () => void;
  ariaInvalid?: boolean;
  placeholder?: string;
};

/**
 * International country-code + number picker shared by owned and affiliate
 * landing order forms. Defaults to `defaultCountry` (Mauritania for owned,
 * the product's affiliate_country for affiliate) but stays fully changeable
 * by the customer. Always yields a full E.164 string via onChange.
 */
export function PhoneCountryInput({
  value,
  onChange,
  defaultCountry,
  onFocus,
  onBlur,
  ariaInvalid,
  placeholder,
}: Props) {
  return (
    <PhoneInput
      international
      defaultCountry={defaultCountry}
      value={value}
      onChange={(next) => onChange(next ?? "")}
      onFocus={onFocus}
      onBlur={onBlur}
      placeholder={placeholder}
      numberInputProps={{
        className: "store-input min-w-0 flex-1 font-mono tabular-nums",
        "aria-invalid": ariaInvalid,
        autoComplete: "tel",
      }}
      className="phone-country-field"
      dir="ltr"
    />
  );
}
