"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { adminAr as a } from "@/locales/admin-ar";
import {
  PERMISSION_CATALOG,
  type PermissionKey,
} from "@/lib/auth/permissions";
import {
  createStaffAction,
  updateStaffAction,
  suspendStaffAction,
  type StaffRow,
} from "./actions";
import { CheckIcon, PlusIcon } from "@/components/admin/AdminIcons";
import { AdminBadge, AdminButton, AdminPageHeader } from "@/components/admin/ui";

type Props = {
  initialStaff: StaffRow[];
};

type FormState = {
  email: string;
  password: string;
  displayName: string;
  permissions: PermissionKey[];
  isActive: boolean;
};

const EMPTY_FORM: FormState = {
  email: "",
  password: "",
  displayName: "",
  permissions: [],
  isActive: true,
};

function PermissionToggles({
  selected,
  onChange,
  disabled,
}: {
  selected: PermissionKey[];
  onChange: (next: PermissionKey[]) => void;
  disabled?: boolean;
}) {
  function toggle(key: PermissionKey) {
    if (disabled) return;
    onChange(
      selected.includes(key)
        ? selected.filter((p) => p !== key)
        : [...selected, key],
    );
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {PERMISSION_CATALOG.map((perm) => {
        const checked = selected.includes(perm.key);
        return (
          <label
            key={perm.key}
            className={`flex min-h-[56px] cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 transition ${
              checked
                ? "border-[var(--accent-muted)] bg-[var(--accent)]/10"
                : "border-[var(--admin-border-strong)] bg-white/[0.02] hover:bg-white/[0.04]"
            } ${disabled ? "pointer-events-none opacity-60" : ""}`}
          >
            <input
              type="checkbox"
              className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--accent)]"
              checked={checked}
              disabled={disabled}
              onChange={() => toggle(perm.key)}
            />
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{perm.labelAr}</span>
              <span className="mt-0.5 block text-xs leading-snug text-[var(--muted)]">{perm.descriptionAr}</span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

function PermissionMatrix({ permissions }: { permissions: PermissionKey[] }) {
  return (
    <div className="flex items-center gap-1.5">
      {PERMISSION_CATALOG.map((perm) => {
        const granted = permissions.includes(perm.key);
        return (
          <span
            key={perm.key}
            title={perm.labelAr}
            aria-label={`${perm.labelAr}: ${granted ? "مفعّل" : "غير مفعّل"}`}
            className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border text-[10px] ${
              granted
                ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                : "border-[var(--admin-border)] bg-white/[0.02] text-[var(--muted)]/40"
            }`}
          >
            {granted ? <CheckIcon size={14} /> : "—"}
          </span>
        );
      })}
    </div>
  );
}

export function StaffAdminView({ initialStaff }: Props) {
  const [staff, setStaff] = useState(initialStaff);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Lock background scroll and allow Escape-to-close while the modal is open.
  useEffect(() => {
    if (!formOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeForm();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formOpen]);

  const editingRow = useMemo(
    () => staff.find((s) => s.id === editingId) ?? null,
    [staff, editingId],
  );

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
    setFormOpen(true);
  }

  function openEdit(row: StaffRow) {
    setEditingId(row.id);
    setForm({
      email: row.email ?? "",
      password: "",
      displayName: row.displayName ?? "",
      permissions: row.permissions,
      isActive: row.isActive,
    });
    setError(null);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
  }

  function onSubmit() {
    startTransition(async () => {
      setError(null);
      if (editingId) {
        const result = await updateStaffAction({
          id: editingId,
          displayName: form.displayName,
          permissions: form.permissions,
          isActive: form.isActive,
          password: form.password || undefined,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setStaff((prev) =>
          prev.map((row) =>
            row.id === editingId
              ? {
                  ...row,
                  displayName: form.displayName || null,
                  permissions: form.permissions,
                  isActive: form.isActive,
                }
              : row,
          ),
        );
      } else {
        const result = await createStaffAction({
          email: form.email,
          password: form.password,
          displayName: form.displayName,
          permissions: form.permissions,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        window.location.reload();
        return;
      }
      closeForm();
    });
  }

  function onToggleSuspend(row: StaffRow) {
    startTransition(async () => {
      setError(null);
      const result = await suspendStaffAction(row.id, row.isActive);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setStaff((prev) =>
        prev.map((s) => (s.id === row.id ? { ...s, isActive: !row.isActive } : s)),
      );
    });
  }

  return (
    <div>
      <AdminPageHeader
        title={a.staff.title}
        subtitle={a.staff.subtitle}
        actions={
          <AdminButton onClick={openCreate}>
            <PlusIcon size={18} />
            {a.staff.addEmployee}
          </AdminButton>
        }
      />

      {error ? (
        <p className="admin-alert-error" role="alert">
          {error}
        </p>
      ) : null}

      {staff.length === 0 ? (
        <p className="admin-card mt-6 p-6 text-sm text-[var(--muted)]">{a.staff.empty}</p>
      ) : (
        <>
          {/* Desktop / laptop: dense data table with at-a-glance permission matrix */}
          <div className="admin-card mt-6 hidden overflow-hidden lg:block">
            <table className="w-full table-fixed border-collapse text-sm">
              <thead className="bg-white/[0.02] text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                <tr>
                  <th className="w-[26%] px-4 py-3 text-start">{a.staff.colEmployee}</th>
                  {PERMISSION_CATALOG.map((perm) => (
                    <th key={perm.key} className="px-1 py-3 text-center" title={perm.labelAr}>
                      {perm.shortAr}
                    </th>
                  ))}
                  <th className="w-[10%] px-3 py-3 text-center">{a.staff.colStatus}</th>
                  <th className="w-[16%] px-4 py-3 text-end">{a.staff.colActions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--admin-border)]">
                {staff.map((row) => (
                  <tr key={row.id} className="transition-colors hover:bg-white/[0.02]">
                    <td className="px-4 py-3 align-middle">
                      <p className="truncate font-semibold text-[var(--foreground)]">
                        {row.displayName || row.email || a.staff.unnamed}
                      </p>
                      {row.email ? (
                        <p className="mt-0.5 truncate text-xs text-[var(--muted)]" dir="ltr">
                          {row.email}
                        </p>
                      ) : null}
                    </td>
                    {PERMISSION_CATALOG.map((perm) => {
                      const granted = row.permissions.includes(perm.key);
                      return (
                        <td key={perm.key} className="px-1 py-3 text-center align-middle">
                          <span
                            aria-label={`${perm.labelAr}: ${granted ? "مفعّل" : "غير مفعّل"}`}
                            className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border ${
                              granted
                                ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                                : "border-[var(--admin-border)] bg-white/[0.01] text-[var(--muted)]/40"
                            }`}
                          >
                            {granted ? <CheckIcon size={14} /> : <span className="text-xs">—</span>}
                          </span>
                        </td>
                      );
                    })}
                    <td className="px-3 py-3 text-center align-middle">
                      <AdminBadge hue={row.isActive ? "emerald" : "red"} size="sm">
                        {row.isActive ? a.staff.active : a.staff.suspended}
                      </AdminBadge>
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(row)}
                          className="rounded-lg border border-[var(--admin-border-strong)] px-3 py-1.5 text-xs font-semibold transition hover:bg-white/[0.06]"
                        >
                          {a.staff.edit}
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => onToggleSuspend(row)}
                          className="rounded-lg border border-[var(--admin-border-strong)] px-3 py-1.5 text-xs font-semibold transition hover:bg-white/[0.06] disabled:opacity-60"
                        >
                          {row.isActive ? a.staff.suspend : a.staff.reactivate}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile / tablet: touch-friendly stackable cards */}
          <div className="mt-6 space-y-3 lg:hidden">
            {staff.map((row) => (
              <article key={row.id} className="admin-card p-4 sm:p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="min-w-0 flex-1 truncate text-base font-bold">
                    {row.displayName || row.email || a.staff.unnamed}
                  </h2>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                      row.isActive
                        ? "border border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                        : "border border-red-400/30 bg-red-400/10 text-red-300"
                    }`}
                  >
                    {row.isActive ? a.staff.active : a.staff.suspended}
                  </span>
                </div>
                {row.email ? (
                  <p className="mt-1 truncate text-sm text-[var(--muted)]" dir="ltr">
                    {row.email}
                  </p>
                ) : null}

                <div className="mt-3">
                  {row.permissions.length === 0 ? (
                    <span className="text-xs text-[var(--muted)]">{a.staff.noPermissions}</span>
                  ) : (
                    <PermissionMatrix permissions={row.permissions} />
                  )}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => openEdit(row)}
                    className="min-h-[44px] rounded-xl border border-[var(--admin-border-strong)] px-4 py-2 text-sm font-semibold transition hover:bg-white/[0.06]"
                  >
                    {a.staff.edit}
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => onToggleSuspend(row)}
                    className="min-h-[44px] rounded-xl border border-[var(--admin-border-strong)] px-4 py-2 text-sm font-semibold transition hover:bg-white/[0.06] disabled:opacity-60"
                  >
                    {row.isActive ? a.staff.suspend : a.staff.reactivate}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      {formOpen && mounted
        ? createPortal(
        <div
          className="admin-shell fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-4"
          dir="rtl"
          lang="ar"
        >
          <button
            type="button"
            aria-label={a.staff.closeForm}
            className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
            onClick={closeForm}
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative z-10 flex max-h-[min(92dvh,900px)] w-full max-w-2xl flex-col rounded-t-2xl border border-[var(--admin-border-strong)] bg-[var(--admin-elevated)] shadow-[0_24px_60px_-24px_rgba(0,0,0,0.85)] sm:max-h-[90vh] sm:rounded-2xl"
          >
            <div className="border-b border-[var(--admin-border)] px-4 py-4 sm:px-6">
              <h2 className="text-lg font-bold">
                {editingRow ? a.staff.editEmployee : a.staff.newEmployee}
              </h2>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
              {!editingId ? (
                <div>
                  <label className="mb-1.5 block text-sm font-medium">{a.login.email}</label>
                  <input
                    type="email"
                    dir="ltr"
                    autoComplete="off"
                    className="admin-input"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  />
                </div>
              ) : null}
              <div>
                <label className="mb-1.5 block text-sm font-medium">{a.staff.displayName}</label>
                <input
                  type="text"
                  className="admin-input"
                  value={form.displayName}
                  onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  {editingId ? a.staff.newPasswordOptional : a.login.password}
                </label>
                <input
                  type="password"
                  dir="ltr"
                  autoComplete="new-password"
                  className="admin-input"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                />
              </div>
              {editingId ? (
                <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border border-[var(--admin-border-strong)] px-3 py-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[var(--accent)]"
                    checked={form.isActive}
                    onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                  />
                  <span className="text-sm font-medium">{a.staff.accountActive}</span>
                </label>
              ) : null}
              <div>
                <p className="mb-2 text-sm font-semibold">{a.staff.permissionsTitle}</p>
                <PermissionToggles
                  selected={form.permissions}
                  onChange={(permissions) => setForm((f) => ({ ...f, permissions }))}
                />
              </div>
            </div>
            <div className="flex flex-col-reverse gap-2 border-t border-[var(--admin-border)] px-4 py-4 sm:flex-row sm:justify-end sm:px-6">
              <button type="button" onClick={closeForm} className="min-h-[44px] rounded-xl border border-[var(--admin-border-strong)] px-4 py-2 text-sm font-semibold">
                {a.staff.cancel}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={onSubmit}
                className="admin-btn-primary min-h-[44px] disabled:opacity-60"
              >
                {pending ? a.common.loading : editingId ? a.staff.save : a.staff.create}
              </button>
            </div>
          </div>
        </div>,
          document.body,
        )
        : null}
    </div>
  );
}
