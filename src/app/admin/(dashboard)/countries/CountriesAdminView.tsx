"use client";

import { useState, useTransition } from "react";
import { adminAr as a } from "@/locales/admin-ar";
import { AdminBadge, AdminButton, AdminPageHeader } from "@/components/admin/ui";
import { PlusIcon } from "@/components/admin/AdminIcons";
import {
  createCountryAction,
  updateCountryAction,
  deleteCountryAction,
  type CountryInput,
} from "./actions";
import type { CountryRow } from "@/types";

type Props = { initialCountries: CountryRow[] };

const EMPTY_FORM: CountryInput = {
  name_ar: "",
  name_fr: "",
  iso_code: "",
  currency: "",
  meta_pixel_id_public: "",
  meta_pixel_id_server: "",
  is_active: true,
};

function toFormInput(c: CountryRow): CountryInput {
  return {
    name_ar: c.name_ar,
    name_fr: c.name_fr,
    iso_code: c.iso_code,
    currency: c.currency,
    meta_pixel_id_public: c.meta_pixel_id_public ?? "",
    meta_pixel_id_server: c.meta_pixel_id_server ?? "",
    is_active: c.is_active,
  };
}

export function CountriesAdminView({ initialCountries }: Props) {
  const [countries, setCountries] = useState(initialCountries);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<CountryInput>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function openCreate() {
    setForm(EMPTY_FORM);
    setError(null);
    setEditingId("new");
  }

  function openEdit(country: CountryRow) {
    setForm(toFormInput(country));
    setError(null);
    setEditingId(country.id);
  }

  function closeForm() {
    setEditingId(null);
    setError(null);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result =
        editingId === "new"
          ? await createCountryAction(form)
          : await updateCountryAction(editingId as string, form);

      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Re-derive list ordering from the server on next navigation; optimistic
      // merge here keeps the UI responsive without a full reload.
      setCountries((prev) => {
        if (editingId === "new") {
          return prev; // real id only known after refetch; simplest is a soft refresh below.
        }
        return prev.map((c) =>
          c.id === editingId
            ? {
                ...c,
                name_ar: form.name_ar.trim(),
                name_fr: form.name_fr.trim(),
                iso_code: form.iso_code.trim().toUpperCase(),
                currency: form.currency.trim().toUpperCase(),
                meta_pixel_id_public: form.meta_pixel_id_public.trim() || null,
                meta_pixel_id_server: form.meta_pixel_id_server.trim() || null,
                is_active: form.is_active,
              }
            : c,
        );
      });
      closeForm();
      if (editingId === "new") {
        window.location.reload();
      }
    });
  }

  function remove(country: CountryRow) {
    if (!window.confirm(a.countries.deleteConfirm)) return;
    startTransition(async () => {
      const result = await deleteCountryAction(country.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setCountries((prev) => prev.filter((c) => c.id !== country.id));
    });
  }

  return (
    <div>
      <AdminPageHeader
        title={a.countries.title}
        subtitle={a.countries.subtitle}
        actions={
          <AdminButton onClick={openCreate}>
            <PlusIcon size={16} />
            {a.countries.addCountry}
          </AdminButton>
        }
      />

      {error && editingId === null ? (
        <p className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      ) : null}

      <div className="admin-card overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-[var(--admin-border)] text-start text-xs font-bold uppercase tracking-wide text-[var(--muted)]">
              <th className="px-4 py-3 text-start">{a.countries.colCountry}</th>
              <th className="px-4 py-3 text-start">{a.countries.colCurrency}</th>
              <th className="px-4 py-3 text-start">{a.countries.colStatus}</th>
              <th className="px-4 py-3 text-start">{a.countries.colActions}</th>
            </tr>
          </thead>
          <tbody>
            {countries.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-[var(--muted)]">
                  {a.countries.empty}
                </td>
              </tr>
            ) : (
              countries.map((c) => (
                <tr key={c.id} className="border-b border-[var(--admin-border)] last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-semibold">{c.name_ar}</p>
                    <p className="text-xs text-[var(--muted)]" dir="ltr">
                      {c.name_fr} · {c.iso_code}
                    </p>
                  </td>
                  <td className="px-4 py-3" dir="ltr">
                    {c.currency}
                  </td>
                  <td className="px-4 py-3">
                    <AdminBadge hue={c.is_active ? "emerald" : "neutral"}>
                      {c.is_active ? a.countries.isActive : a.countries.inactive}
                    </AdminBadge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <AdminButton variant="sm-ghost" onClick={() => openEdit(c)}>
                        {a.countries.edit}
                      </AdminButton>
                      <AdminButton
                        variant="danger"
                        className="!min-h-[44px] !px-3 !py-2 text-xs"
                        onClick={() => remove(c)}
                        disabled={pending}
                      >
                        {a.countries.delete}
                      </AdminButton>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {editingId !== null ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="admin-card w-full max-w-lg space-y-4 p-5">
            <h2 className="text-lg font-bold">
              {editingId === "new" ? a.countries.newCountry : a.countries.editCountry}
            </h2>

            {error ? (
              <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {error}
              </p>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-sm font-medium">{a.countries.nameAr}</label>
                <input
                  className="mt-1 w-full admin-input"
                  value={form.name_ar}
                  onChange={(e) => setForm((f) => ({ ...f, name_ar: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-sm font-medium">{a.countries.nameFr}</label>
                <input
                  className="mt-1 w-full admin-input"
                  value={form.name_fr}
                  onChange={(e) => setForm((f) => ({ ...f, name_fr: e.target.value }))}
                  dir="ltr"
                />
              </div>
              <div>
                <label className="text-sm font-medium">{a.countries.isoCode}</label>
                <input
                  className="mt-1 w-full admin-input"
                  value={form.iso_code}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, iso_code: e.target.value.toUpperCase() }))
                  }
                  maxLength={2}
                  placeholder="MR"
                  dir="ltr"
                />
              </div>
              <div>
                <label className="text-sm font-medium">{a.countries.currency}</label>
                <input
                  className="mt-1 w-full admin-input"
                  value={form.currency}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, currency: e.target.value.toUpperCase() }))
                  }
                  maxLength={3}
                  placeholder="MRU"
                  dir="ltr"
                />
              </div>
              <div>
                <label className="text-sm font-medium">{a.countries.metaPixelPublic}</label>
                <input
                  className="mt-1 w-full admin-input"
                  value={form.meta_pixel_id_public}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, meta_pixel_id_public: e.target.value }))
                  }
                  dir="ltr"
                />
              </div>
              <div>
                <label className="text-sm font-medium">{a.countries.metaPixelServer}</label>
                <input
                  className="mt-1 w-full admin-input"
                  value={form.meta_pixel_id_server}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, meta_pixel_id_server: e.target.value }))
                  }
                  dir="ltr"
                />
              </div>
            </div>
            <p className="text-xs text-[var(--muted)]">{a.countries.metaPixelHint}</p>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-5 w-5 accent-[var(--accent)]"
                checked={form.is_active}
                onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
              />
              {a.countries.isActive}
            </label>

            <div className="flex justify-end gap-2">
              <AdminButton variant="ghost" onClick={closeForm} disabled={pending}>
                {a.countries.cancel}
              </AdminButton>
              <AdminButton onClick={submit} disabled={pending}>
                {editingId === "new" ? a.countries.create : a.countries.save}
              </AdminButton>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
