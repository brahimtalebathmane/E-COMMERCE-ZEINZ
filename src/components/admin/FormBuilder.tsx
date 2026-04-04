"use client";

import type { FormFieldConfig, FormFieldType } from "@/types";
import { adminAr as a } from "@/locales/admin-ar";

type Props = {
  value: FormFieldConfig[];
  onChange: (next: FormFieldConfig[]) => void;
  /** Aligned with `value` (same ids); only `label` is edited for French. */
  frFields: FormFieldConfig[];
  onFrLabelChange: (index: number, label: string) => void;
};

const TYPES: FormFieldType[] = ["text", "textarea", "file", "email", "link"];

const TYPE_LABEL: Record<FormFieldType, string> = {
  text: a.fieldTypes.text,
  textarea: a.fieldTypes.textarea,
  file: a.fieldTypes.file,
  email: a.fieldTypes.email,
  link: a.fieldTypes.link,
};

export function FormBuilder({
  value,
  onChange,
  frFields,
  onFrLabelChange,
}: Props) {
  function addField() {
    onChange([
      ...value,
      {
        id: crypto.randomUUID(),
        label: a.formBuilder.newFieldDefault,
        type: "text",
        required: false,
      },
    ]);
  }

  function update(i: number, patch: Partial<FormFieldConfig>) {
    const next = [...value];
    next[i] = { ...next[i], ...patch };
    onChange(next);
  }

  function remove(i: number) {
    onChange(value.filter((_, j) => j !== i));
  }

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    const t = next[i];
    next[i] = next[j]!;
    next[j] = t!;
    onChange(next);
  }

  return (
    <section
      className="space-y-4 rounded-xl border border-[var(--accent-muted)] bg-[var(--card)] p-4 sm:p-5"
      dir="rtl"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h3 className="text-sm font-semibold">{a.formBuilder.title}</h3>
          <p className="text-xs leading-relaxed text-[var(--muted)]">
            {a.formBuilder.bilingualHint}
          </p>
        </div>
        <button
          type="button"
          onClick={addField}
          className="shrink-0 rounded-lg bg-[var(--accent-muted)] px-3 py-1.5 text-xs font-medium"
        >
          {a.formBuilder.addField}
        </button>
      </div>

      <div className="space-y-4">
        {value.map((f, i) => (
          <div
            key={f.id}
            className="rounded-xl border border-[var(--accent-muted)] bg-[var(--background)] p-4 shadow-sm"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="min-w-0">
                <label className="text-xs font-medium text-[var(--muted)]">
                  {a.formBuilder.fieldLabel} — {a.productForm.langArabic}
                </label>
                <input
                  className="mt-1.5 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
                  value={f.label}
                  onChange={(e) => update(i, { label: e.target.value })}
                  autoComplete="off"
                />
              </div>
              <div className="min-w-0">
                <label className="text-xs font-medium text-[var(--muted)]">
                  {a.formBuilder.fieldLabel} — {a.productForm.langFrench}
                </label>
                <input
                  className="mt-1.5 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
                  value={frFields[i]?.label ?? ""}
                  onChange={(e) => onFrLabelChange(i, e.target.value)}
                  dir="ltr"
                  autoComplete="off"
                />
              </div>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-[var(--muted)]">
                  {a.formBuilder.type}
                </label>
                <select
                  className="mt-1.5 w-full rounded-lg border border-[var(--accent-muted)] px-3 py-2 text-sm"
                  value={f.type}
                  onChange={(e) =>
                    update(i, { type: e.target.value as FormFieldType })
                  }
                >
                  {TYPES.map((t) => (
                    <option key={t} value={t}>
                      {TYPE_LABEL[t]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <span className="text-xs font-medium text-[var(--muted)]">
                  {a.formBuilder.requirement}
                </span>
                <div
                  className="mt-2 flex flex-wrap gap-4"
                  role="group"
                  aria-label={a.formBuilder.requirement}
                >
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name={`form-field-req-${f.id}`}
                      className="accent-[var(--accent)]"
                      checked={f.required}
                      onChange={() => update(i, { required: true })}
                    />
                    {a.formBuilder.requiredOption}
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name={`form-field-req-${f.id}`}
                      className="accent-[var(--accent)]"
                      checked={!f.required}
                      onChange={() => update(i, { required: false })}
                    />
                    {a.formBuilder.optionalOption}
                  </label>
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2 border-t border-[var(--accent-muted)]/60 pt-3">
              <button
                type="button"
                className="text-xs text-[var(--muted)] underline"
                onClick={() => move(i, -1)}
              >
                {a.formBuilder.up}
              </button>
              <button
                type="button"
                className="text-xs text-[var(--muted)] underline"
                onClick={() => move(i, 1)}
              >
                {a.formBuilder.down}
              </button>
              <button
                type="button"
                className="text-xs text-red-600 underline dark:text-red-400"
                onClick={() => remove(i)}
              >
                {a.formBuilder.remove}
              </button>
            </div>
          </div>
        ))}
      </div>
      {value.length === 0 ? (
        <p className="text-xs text-[var(--muted)]">{a.formBuilder.emptyHint}</p>
      ) : null}
    </section>
  );
}
