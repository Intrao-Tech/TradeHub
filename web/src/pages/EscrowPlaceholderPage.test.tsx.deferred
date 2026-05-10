// TEST-COLLAB-150 — EscrowPlaceholderPage (COLLAB-003).

import { describe, expect, test } from 'vitest';
import { Routes, Route } from 'react-router-dom';
import { renderWithRouter, screen } from '@/test/render';
import EscrowPlaceholderPage from './EscrowPlaceholderPage';

function withRoute() {
  return (
    <Routes>
      <Route path="/escrow/:id" element={<EscrowPlaceholderPage />} />
      <Route
        path="/collaborations/:id"
        element={<div>COLLAB-DETAIL-FALLBACK</div>}
      />
    </Routes>
  );
}

describe('TEST-COLLAB-150 EscrowPlaceholderPage — COLLAB-003', () => {
  test('TEST-COLLAB-150 / COLLAB-003 — renders the EmptyState with title and back-link to the parent collaboration', () => {
    renderWithRouter(withRoute(), { route: '/escrow/123' });
    expect(screen.getByText(/Escrow is coming soon/i)).toBeInTheDocument();
    const links = screen.getAllByRole('link', {
      name: /back to collaboration/i,
    });
    expect(links.length).toBeGreaterThanOrEqual(1);
    for (const link of links) {
      expect(link).toHaveAttribute('href', '/collaborations/123');
    }
  });

  test('TEST-COLLAB-150 / COLLAB-003 — does not render any escrow mutation buttons (read-only placeholder)', () => {
    renderWithRouter(withRoute(), { route: '/escrow/123' });
    expect(
      screen.queryByRole('button', { name: /create escrow/i }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: /fund/i }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: /confirm deposit/i }),
    ).toBeNull();
    expect(screen.queryByRole('button', { name: /^release$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^refund$/i })).toBeNull();
  });
});
