// TEST-REVIEW-220..223 — Reviews surface guardrails.
//
// File-system + grep tests that lock down the negative invariants of the
// parent feature: no JSON.stringify panes, no resurrected ReviewsPage,
// no resurrected /reviews nav item.

import { describe, expect, test } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

const ROOT = process.cwd();

function readIfExists(path: string): string | null {
  if (!existsSync(path)) return null;
  return readFileSync(path, 'utf8');
}

function walk(dir: string, predicate: (p: string) => boolean): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) {
      out.push(...walk(full, predicate));
    } else if (predicate(full)) {
      out.push(full);
    }
  }
  return out;
}

// The guardrail targets the *debug-dump* pattern `<pre>{JSON.stringify(...)}</pre>`.
// Legitimate uses (request-body serialisation, localStorage encoding) are
// allowed; only the debug-pane shape is rejected, matching the pattern in
// `tests-jobs-applications` / `tests-collaborations-polish`.
const DEBUG_PANE_RE =
  /<pre[^>]*>\s*\{\s*JSON\.stringify/;

describe('TEST-REVIEW-220 — REVIEW-001 no <pre>{JSON.stringify(...)}</pre> on the Reviews surface', () => {
  const TARGETS: Array<{ label: string; path: string }> = [
    {
      label: 'web/src/components/reviews/**',
      path: join(ROOT, 'src', 'components', 'reviews'),
    },
    {
      label: 'web/src/components/admin/ReviewsPublishQueueTab.tsx',
      path: join(ROOT, 'src', 'components', 'admin', 'ReviewsPublishQueueTab.tsx'),
    },
    {
      label: 'web/src/pages/ReviewDetailPage.tsx',
      path: join(ROOT, 'src', 'pages', 'ReviewDetailPage.tsx'),
    },
    // AdminPage's Reviews-tab subtree is rendered entirely by
    // <ReviewsPublishQueueTab /> (covered above). Other AdminPage tabs
    // legitimately render debug JSON dumps and are out of scope here.
  ];

  test.each(TARGETS)(
    'TEST-REVIEW-220 / REVIEW-001 — $label has no <pre>{JSON.stringify(...)}</pre>',
    ({ path }) => {
      const stat = existsSync(path) ? statSync(path) : null;
      const files = stat?.isDirectory()
        ? walk(path, (f) => /\.(tsx|ts)$/.test(f))
        : stat?.isFile()
          ? [path]
          : [];
      for (const f of files) {
        if (/\.test\.tsx?$/.test(f)) continue;
        const src = readFileSync(f, 'utf8');
        expect(DEBUG_PANE_RE.test(src)).toBe(false);
      }
    },
  );

  test('TEST-REVIEW-220 / REVIEW-001 — Worker / Employer detail pages have no debug JSON pane', () => {
    for (const p of [
      join(ROOT, 'src', 'pages', 'WorkerDetailPage.tsx'),
      join(ROOT, 'src', 'pages', 'EmployerDetailPage.tsx'),
    ]) {
      const src = readFileSync(p, 'utf8');
      expect(DEBUG_PANE_RE.test(src)).toBe(false);
    }
  });
});

describe('TEST-REVIEW-221 — REVIEW-002 ReviewsPage.tsx is deleted', () => {
  test('TEST-REVIEW-221 / REVIEW-002 — web/src/pages/ReviewsPage.tsx no longer exists', () => {
    expect(existsSync(join(ROOT, 'src', 'pages', 'ReviewsPage.tsx'))).toBe(false);
  });

  test('TEST-REVIEW-221 / REVIEW-002 — no other ReviewsPage.* files remain', () => {
    const pages = readdirSync(join(ROOT, 'src', 'pages'));
    expect(pages.find((f) => f.startsWith('ReviewsPage.'))).toBeUndefined();
  });
});

describe('TEST-REVIEW-222 — REVIEW-060 lint:tokens script exists', () => {
  test('TEST-REVIEW-222 / REVIEW-060 — lint:tokens script is wired in package.json', () => {
    const pkg = JSON.parse(
      readFileSync(join(ROOT, 'package.json'), 'utf8'),
    ) as { scripts?: Record<string, string> };
    expect(pkg.scripts?.['lint:tokens']).toBeTruthy();
  });
});

describe('TEST-REVIEW-223 — REVIEW-002 App.tsx no longer references ReviewsPage', () => {
  test('TEST-REVIEW-223 / REVIEW-002 — App.tsx imports no ReviewsPage and has no /reviews nav entry', () => {
    const src = readIfExists(join(ROOT, 'src', 'App.tsx')) ?? '';
    // No lazy import of ReviewsPage (only ReviewDetailPage may exist).
    expect(/ReviewsPage(?!\w)/.test(src)).toBe(false);
    // No nav item pointing at /reviews — we look for the documented shape.
    expect(/\{\s*to:\s*['"]\/reviews['"]/.test(src)).toBe(false);
  });
});
