// i18n key-parity gate. For every namespace, asserts that each non-English
// locale has exactly the same key set as English (modulo plural suffixes,
// which legitimately differ: EN has _one/_other, UK adds _few/_many) and that
// every {{interpolation}} placeholder matches between languages.
//
// This guards against the two classic "crooked translation" bugs:
//   1. a key added to en/*.json but forgotten in uk/*.json (renders raw/fallback)
//   2. a renamed/typo'd {{var}} so interpolation silently drops the value
//
// Run with `npm run i18n:check`. Exits non-zero (fails CI) on any mismatch.
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'locales');
const REFERENCE = 'en';
const langs = readdirSync(root).filter((d) => d !== REFERENCE);
const namespaces = readdirSync(join(root, REFERENCE)).filter((f) => f.endsWith('.json'));

const PLURAL = /_(zero|one|two|few|many|other)$/;
const stripPlural = (k) => k.replace(PLURAL, '');
const placeholders = (s) =>
  [...String(s).matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)].map((m) => m[1]).sort();

function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}

const problems = [];

for (const ns of namespaces) {
  const en = flatten(JSON.parse(readFileSync(join(root, REFERENCE, ns), 'utf8')));
  const enBaseKeys = new Set(Object.keys(en).map(stripPlural));

  for (const lng of langs) {
    let other;
    try {
      other = flatten(JSON.parse(readFileSync(join(root, lng, ns), 'utf8')));
    } catch (e) {
      problems.push(`[${lng}/${ns}] cannot read/parse: ${e.message}`);
      continue;
    }
    const otherBaseKeys = new Set(Object.keys(other).map(stripPlural));

    for (const k of enBaseKeys) {
      if (!otherBaseKeys.has(k)) problems.push(`[${lng}/${ns}] missing key: ${k}`);
    }
    for (const k of otherBaseKeys) {
      if (!enBaseKeys.has(k)) problems.push(`[${lng}/${ns}] extra key not in ${REFERENCE}: ${k}`);
    }
    // Placeholder parity on keys present in both (exact, including plural form).
    for (const k of Object.keys(en)) {
      if (other[k] == null) continue;
      const a = placeholders(en[k]).join(',');
      const b = placeholders(other[k]).join(',');
      if (a !== b) problems.push(`[${lng}/${ns}] ${k}: placeholders {${a}} vs {${b}}`);
    }
  }
}

if (problems.length) {
  console.error(`i18n check failed (${problems.length}):\n` + problems.map((p) => '  ' + p).join('\n'));
  process.exit(1);
}
console.log(
  `i18n check passed: ${namespaces.length} namespace(s) × ${langs.length} non-${REFERENCE} locale(s) — keys and placeholders aligned.`,
);
