// TEST-PROF-113 — WorkerCard / EmployerCard navigation wiring (PROF-005,
// PROF-044, PROF-045, PROF-046).
//
// PROF-005: WorkerCard.onSelect / EmployerCard.onSelect must be wired in the
// search pages to navigate to /workers/:id / /employers/:id respectively.
// PROF-046: each card surfaces a verification badge.
//
// We test the card primitives directly rather than mounting the full search
// page (which has its own MSW dependency surface in the e2e suite).

import { describe, expect, test, vi } from 'vitest';
import { renderWithRouter, screen, userEvent } from '@/test/render';
import { WorkerCard } from './WorkerCard';
import { EmployerCard } from './EmployerCard';

describe('TEST-PROF-113 WorkerCard (PROF-005, PROF-044, PROF-046)', () => {
  test('PROF-005 — onSelect fires with the worker payload on card click', async () => {
    const onSelect = vi.fn();
    const worker = {
      id: '42',
      headline: 'Carpenter',
      day_rate: 250,
      postcode_area: 'NW1',
      client_profile: {
        display_name: 'Mike Builder',
        verification_level: 'KYC',
      },
    };
    renderWithRouter(<WorkerCard worker={worker} onSelect={onSelect} />);
    await userEvent.setup().click(
      screen.getByRole('heading', { name: /mike builder/i }),
    );
    expect(onSelect).toHaveBeenCalledWith(worker);
  });

  test('PROF-046 — verification badge renders consistent with PROF-032 vocabulary', () => {
    renderWithRouter(
      <WorkerCard
        worker={{
          id: '1',
          client_profile: { display_name: 'X', verification_level: 'KYC' },
        }}
      />,
    );
    expect(screen.getByText(/kyc verified/i)).toBeInTheDocument();
  });

  test('PROF-044 — no `<pre>{JSON.stringify(...)}</pre>` block in the card DOM', () => {
    const { container } = renderWithRouter(
      <WorkerCard
        worker={{
          id: '1',
          client_profile: { display_name: 'No JSON Dump', verification_level: 'UNVERIFIED' },
        }}
      />,
    );
    expect(container.querySelector('pre')).toBeNull();
  });
});

describe('TEST-PROF-113 EmployerCard (PROF-005, PROF-044, PROF-046)', () => {
  test('PROF-005 — onSelect fires with the employer payload on card click', async () => {
    const onSelect = vi.fn();
    const employer = {
      id: '7',
      client_profile: { display_name: 'Acme', verification_level: 'UNVERIFIED' },
    };
    renderWithRouter(<EmployerCard employer={employer} onSelect={onSelect} />);
    await userEvent.setup().click(screen.getByText(/acme/i));
    expect(onSelect).toHaveBeenCalledWith(employer);
  });

  test('PROF-046 — verification badge renders for employers too', () => {
    renderWithRouter(
      <EmployerCard
        employer={{
          id: '7',
          client_profile: { display_name: 'Acme', verification_level: 'HMRC' },
        }}
      />,
    );
    expect(screen.getByText(/hmrc confirmed/i)).toBeInTheDocument();
  });
});
