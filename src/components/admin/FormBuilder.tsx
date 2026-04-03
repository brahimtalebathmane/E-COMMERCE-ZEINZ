"use client";

import type { FormFieldConfig, FormFieldType } from "@/types";

type Props = {
  value: FormFieldConfig[];
  onChange: (next: FormFieldConfig[]) => void;
};

const TYPES: FormFieldType[] = ["text", "textarea", "file", "email", "link"];

export function FormBuilder({ value, onChange }: Props) {
  function addField() {
    onChange([
      ...value,
      {
        id: crypto.randomUUID(),
        label: "New field",
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Post-payment form fields</h3>
        <button
          type="button"
          onClick={addField}
          className="rounded-lg bg-[var(--accent-muted)] px-3 py-1.5 text-xs font-medium"
        >
          Add field
        </button>
      </div>
      <div className="space-y-3">
        {value.map((f, i) => (
          <div
            key={f.id}
            className="rounded-xl border border-[var(--accent-muted)] bg-[var(--background)] p-4"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="text-xs text-[var(--muted)]">Label</label>
                <input
                  className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-2 py-1.5 text-sm"
                  value={f.label}
                  onChange={(e) => update(i, { label: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-[var(--muted)]">Type</label>
                <select
                  className="mt-1 w-full rounded-lg border border-[var(--accent-muted)] px-2 py-1.5 text-sm"
                  value={f.type}
                  onChange={(e) =>
                    update(i, { type: e.target.value as FormFieldType })
                  }
                >
                  {TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={f.required}
                    onChange={(e) => update(i, { required: e.target.checked })}
                  />
                  Required
                </label>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="text-xs text-[var(--muted)] underline"
                onClick={() => move(i, -1)}
              >
                Up
              </button>
              <button
                type="button"
                className="text-xs text-[var(--muted)] underline"
                onClick={() => move(i, 1)}
              >
                Down
              </button>
              <button
                type="button"
                className="text-xs text-red-600 underline"
                onClick={() => remove(i)}
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
      {value.length === 0 ? (
        <p className="text-xs text-[var(--muted)]">
          No fields yet. Customers can still confirm after payment if you add none
          (not recommended).
        </p>
      ) : null}
    </div>
  );
}
