import { Link } from 'react-router-dom';

type FooterLink = { to: string; label: string };
type FooterColumn = { title: string; links: FooterLink[] };

const COLUMNS: FooterColumn[] = [
  {
    title: 'For tradespeople',
    links: [
      { to: '/jobs', label: 'Find jobs' },
      { to: '/employers', label: 'Find employers' },
      { to: '/register?next=/jobs', label: 'Sign up' },
    ],
  },
  {
    title: 'For employers',
    links: [
      { to: '/workers', label: 'Find tradespeople' },
      { to: '/register?next=/my-jobs', label: 'Post a job' },
    ],
  },
  {
    title: 'Account',
    links: [
      { to: '/login', label: 'Log in' },
      { to: '/register', label: 'Sign up' },
    ],
  },
];

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="mx-auto w-full max-w-7xl px-4 pb-8 sm:pb-12">
      <div className="rounded-lg bg-footer px-6 py-12 text-footer-fg sm:px-10 sm:py-14">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-fg text-base font-bold">
                T
              </span>
              <span className="text-base font-semibold">TradeHub</span>
            </div>
            <p className="text-sm text-footer-fg-muted">
              UK construction tradespeople and employers — verified, reviewed,
              escrow-protected.
            </p>
          </div>

          {COLUMNS.map((col) => (
            <nav key={col.title} aria-label={col.title} className="space-y-3">
              <h2 className="text-sm font-semibold">{col.title}</h2>
              <ul className="space-y-2">
                {col.links.map((link) => (
                  <li key={link.to + link.label}>
                    <Link
                      to={link.to}
                      className="text-sm text-footer-fg-muted hover:text-footer-fg"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-footer-border pt-6 text-xs text-footer-fg-muted sm:flex-row sm:items-center sm:justify-between">
          <span>© {year} TradeHub UK</span>
        </div>
      </div>
    </footer>
  );
}
Footer.displayName = 'Footer';
