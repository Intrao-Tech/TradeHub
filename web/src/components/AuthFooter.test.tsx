// AuthFooter unit tests — logged-in footer rendered by AppShell when the user
// is authenticated. Mirrors the Upwork /find-work/best-matches footer:
// utility link columns + Follow Us / Mobile app rows + copyright. All link
// targets are stubs to `/` per product decision (no real social/legal pages
// exist yet).

import { describe, expect, test } from 'vitest';
import { renderWithRouter, screen } from '@/test/render';
import { AuthFooter } from './AuthFooter';

describe('AuthFooter', () => {
  test('renders the four utility link columns', () => {
    renderWithRouter(<AuthFooter />);
    for (const label of [
      'About Us',
      'Help & Support',
      'Privacy Policy',
      'Terms of Service',
      'Cookie Policy',
      'Accessibility',
      'Mobile App',
      'Desktop App',
      'Release notes',
    ]) {
      expect(
        screen.getByRole('link', { name: label }),
      ).toBeInTheDocument();
    }
  });

  test('every utility link is a stub pointing at "/"', () => {
    renderWithRouter(<AuthFooter />);
    const stubs = screen
      .getAllByRole('link')
      .filter((el) => /^(About Us|Feedback|Trust|Help|Terms|Modern|Privacy|Cookie|Accessibility|Mobile App|Desktop App|Enterprise|Release)/.test(
        el.textContent ?? '',
      ));
    expect(stubs.length).toBeGreaterThan(0);
    for (const a of stubs) {
      expect(a.getAttribute('href')).toBe('/');
    }
  });

  test('renders all five social icons as accessible stubs to "/"', () => {
    renderWithRouter(<AuthFooter />);
    for (const label of ['Facebook', 'LinkedIn', 'X', 'YouTube', 'Instagram']) {
      const link = screen.getByRole('link', { name: label });
      expect(link.getAttribute('href')).toBe('/');
    }
  });

  test('renders the mobile-app icons', () => {
    renderWithRouter(<AuthFooter />);
    expect(
      screen.getByRole('link', { name: 'iOS app' }).getAttribute('href'),
    ).toBe('/');
    expect(
      screen.getByRole('link', { name: 'Android app' }).getAttribute('href'),
    ).toBe('/');
  });

  test('shows the current-year copyright', () => {
    renderWithRouter(<AuthFooter />);
    const year = new Date().getFullYear();
    expect(
      screen.getByText(`© ${year} TradeHub UK`),
    ).toBeInTheDocument();
  });
});
