// TEST-REVIEW-170..172 — route registration assertions for the Reviews
// surface (REVIEW-002..004, REVIEW-051).
//
// Smoke checks the App.tsx route table by string-matching the source.

import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const APP_TSX_PATH = join(process.cwd(), 'src', 'App.tsx');

function appSource() {
  return readFileSync(APP_TSX_PATH, 'utf8');
}

describe('TEST-REVIEW-170 — REVIEW-002 / REVIEW-004 /reviews redirect', () => {
  test('TEST-REVIEW-170 / REVIEW-002 — /reviews route is a <Navigate> redirect', () => {
    const src = appSource();
    // The route block must contain Navigate within the path="/reviews" element.
    const idx = src.indexOf('path="/reviews"');
    expect(idx).toBeGreaterThan(-1);
    const slice = src.slice(idx, idx + 400);
    expect(slice).toMatch(/Navigate/);
  });

  test('TEST-REVIEW-170 / REVIEW-004 — logged-in branch carries `?from=reviews`', () => {
    expect(appSource()).toContain('/collaborations?from=reviews');
  });

  test('TEST-REVIEW-170 / REVIEW-002 — anonymous branch redirects to /login', () => {
    const src = appSource();
    const idx = src.indexOf('path="/reviews"');
    const slice = src.slice(idx, idx + 400);
    expect(slice).toMatch(/\/login/);
  });
});

describe('TEST-REVIEW-171 — REVIEW-003 / REVIEW-051 /reviews/:id route', () => {
  test('TEST-REVIEW-171 / REVIEW-003 — /reviews/:id is registered', () => {
    expect(appSource()).toContain('path="/reviews/:id"');
  });

  test('TEST-REVIEW-171 / REVIEW-051 — /reviews/:id is wrapped in <Protected>', () => {
    const src = appSource();
    const lineMatch = src
      .split('\n')
      .find((l) => l.includes('path="/reviews/:id"'));
    expect(lineMatch).toBeDefined();
    expect(lineMatch ?? '').toMatch(/<Protected/);
  });
});
