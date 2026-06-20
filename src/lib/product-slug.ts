import { RESERVED_SLUGS } from "@/lib/constants";
import { slugify } from "@/lib/slug";
import type { SupabaseClient } from "@supabase/supabase-js";

export function normalizeProductSlug(input: string): string {
  return slugify(input);
}

export function assertValidProductSlug(candidate: string): void {
  if (!candidate) {
    throw new Error("مسار الرابط مطلوب.");
  }
  if (RESERVED_SLUGS.has(candidate)) {
    throw new Error("مسار الرابط محجوز ولا يمكن استخدامه.");
  }
}

async function slugTakenByAnotherProduct(
  supabase: SupabaseClient,
  candidate: string,
  excludeProductId?: string,
): Promise<boolean> {
  let slugQuery = supabase.from("products").select("id").eq("slug", candidate);
  if (excludeProductId) {
    slugQuery = slugQuery.neq("id", excludeProductId);
  }
  const { data: bySlug } = await slugQuery.maybeSingle();
  if (bySlug) return true;

  let legacyQuery = supabase
    .from("products")
    .select("id")
    .contains("old_slugs", [candidate]);
  if (excludeProductId) {
    legacyQuery = legacyQuery.neq("id", excludeProductId);
  }
  const { data: byLegacy } = await legacyQuery.maybeSingle();
  return !!byLegacy;
}

export async function allocateUniqueSlug(
  supabase: SupabaseClient,
  nameAr: string,
): Promise<string> {
  const base = slugify(nameAr);
  if (!base || RESERVED_SLUGS.has(base)) {
    throw new Error("Choose a different product name (reserved or empty slug).");
  }

  let candidate = base;
  for (let i = 0; i < 80; i += 1) {
    const taken = await slugTakenByAnotherProduct(supabase, candidate);
    if (!taken) {
      return candidate;
    }
    candidate = `${base}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  throw new Error("Could not allocate a unique slug — try again.");
}

type ExistingSlugRow = {
  id: string;
  slug: string;
  old_slugs: string[];
};

export async function resolveProductSlugFields(
  supabase: SupabaseClient,
  payloadSlug: string,
  nameAr: string,
  existing?: ExistingSlugRow | null,
): Promise<{ slug: string; old_slugs: string[] }> {
  if (!existing) {
    const raw = payloadSlug.trim();
    const candidate = raw
      ? normalizeProductSlug(raw)
      : await allocateUniqueSlug(supabase, nameAr);
    assertValidProductSlug(candidate);
    if (await slugTakenByAnotherProduct(supabase, candidate)) {
      throw new Error("مسار الرابط مستخدم بالفعل لمنتج آخر.");
    }
    return { slug: candidate, old_slugs: [] };
  }

  const previousSlug = existing.slug;
  const requested = payloadSlug.trim();
  const newSlug = requested ? normalizeProductSlug(requested) : previousSlug;

  assertValidProductSlug(newSlug);

  if (
    newSlug !== previousSlug &&
    (await slugTakenByAnotherProduct(supabase, newSlug, existing.id))
  ) {
    throw new Error("مسار الرابط مستخدم بالفعل لمنتج آخر.");
  }

  const old_slugs = [...(existing.old_slugs ?? [])].filter((s) => s !== newSlug);
  if (previousSlug !== newSlug && previousSlug && !old_slugs.includes(previousSlug)) {
    old_slugs.push(previousSlug);
  }

  return { slug: newSlug, old_slugs };
}
