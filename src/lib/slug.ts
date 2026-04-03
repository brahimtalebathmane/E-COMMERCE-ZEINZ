function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}

export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "product";
}

export function makeUniqueSlug(base: string, exists: (s: string) => boolean): string {
  let candidate = base;
  if (!exists(candidate)) return candidate;
  candidate = `${base}-${Date.now().toString(36)}`;
  if (!exists(candidate)) return candidate;
  let i = 0;
  while (i < 50) {
    candidate = `${base}-${randomSuffix()}`;
    if (!exists(candidate)) return candidate;
    i += 1;
  }
  return `${base}-${Date.now()}-${randomSuffix()}`;
}
