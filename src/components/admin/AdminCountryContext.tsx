"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { CountryRow } from "@/types";

type CountryScopeValue = {
  countries: CountryRow[];
  selectedCountryId: string;
};

const AdminCountryContext = createContext<CountryScopeValue | null>(null);

export function AdminCountryProvider({
  countries,
  selectedCountryId,
  children,
}: CountryScopeValue & { children: ReactNode }) {
  return (
    <AdminCountryContext.Provider value={{ countries, selectedCountryId }}>
      {children}
    </AdminCountryContext.Provider>
  );
}

export function useAdminCountryScope(): CountryScopeValue {
  const ctx = useContext(AdminCountryContext);
  if (!ctx) {
    throw new Error("useAdminCountryScope must be used within AdminCountryProvider");
  }
  return ctx;
}
