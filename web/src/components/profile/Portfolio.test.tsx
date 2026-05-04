// TEST-PROF-105 — Portfolio editor components.
//
// The Profiles spec mentions PortfolioItemDialog / PortfolioMediaGrid /
// PortfolioDocumentLinker as named components.  As of the 2026-05-03 cut,
// portfolio editing lives inside `PortfolioTab` rather than the named
// dialog/grid/linker primitives.  Per TEST-PROF-105 the regression-guard
// surface is the discriminated PATCH endpoint targeting (PROF-021), the
// drag-drop / caption / delete media affordances (PROF-023, PROF-025), and
// the APPROVED-only document picker (PROF-026).  Drag-and-drop reordering
// uses HTML5 native DnD, which jsdom does not implement; that surface is
// covered by Playwright (TEST-PROF-141) instead.

import { describe, test } from 'vitest';

describe('TEST-PROF-105 Portfolio editor surface (PROF-021 / PROF-023 / PROF-025 / PROF-026)', () => {
  test.skip(
    'PROF-021 — TODO: PortfolioItemDialog branches by item_type and submits to the right endpoint. ' +
      'Today portfolio editing is in-place inside PortfolioTab; ' +
      'the discriminated-PATCH contract is exercised by TEST-PROF-074 e2e.',
    () => {
      // empty
    },
  );
  test.skip(
    'PROF-023 / PROF-025 — TODO: PortfolioMediaGrid drag-drop / captions / delete unit tests. ' +
      'HTML5 DnD is not implemented in jsdom — covered by Playwright TEST-PROF-141.',
    () => {
      // empty
    },
  );
  test.skip(
    'PROF-026 — TODO: PortfolioDocumentLinker only lists APPROVED documents. ' +
      'Component does not exist as a named primitive; behaviour exercised by ' +
      'TEST-PROF-076 e2e and TEST-PROF-141 Playwright.',
    () => {
      // empty
    },
  );
  test.skip(
    'PROF-027 — TODO: verified portfolio items render the "Verified by TradeHub" indicator. ' +
      'Tracked here once a dedicated PortfolioMediaGrid lands.',
    () => {
      // empty
    },
  );
});
