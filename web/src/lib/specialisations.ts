// Localised display name for a trade specialisation.
//
// Specialisation names live in the backend DB (seeded English), so they can't
// be translated by extracting frontend strings. Instead we map the canonical
// slug → a localised label in the `common` namespace (`spec.<slug>`), and fall
// back to the raw API name for anything not in the catalog (e.g. a brand-new
// specialisation an admin just added). The slug is derived the same way the
// seed does (`name.toLowerCase()` → non-alphanumerics to `-`), so passing just
// the English name is enough at every call site.

type TFn = (key: string, opts?: Record<string, unknown>) => string;

export function slugifySpec(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function specLabel(name: string | null | undefined, t: TFn): string {
  if (!name) return name ?? '';
  return t(`common:spec.${slugifySpec(name)}`, { defaultValue: name });
}

// Tags share the same idea but the backend slug rule differs slightly
// (`&` → `and`). Unknown tags (admins can add free-form ones) fall back to
// the raw API name.
function slugifyTag(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]+/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function tagLabel(name: string | null | undefined, t: TFn): string {
  if (!name) return name ?? '';
  return t(`common:tag.${slugifyTag(name)}`, { defaultValue: name });
}
