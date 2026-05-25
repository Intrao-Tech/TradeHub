// TEST-PROF-109 — CompletenessPanel (PROF-035 / PROF-036 / PROF-037).

import { describe, expect, test, vi } from 'vitest';
import { renderWithRouter, screen, userEvent } from '@/test/render';
import { CompletenessPanel } from './CompletenessPanel';
import { mockClientProfile, mockWorkerProfile, mockEmployerProfile } from '@/test/factories';

describe('TEST-PROF-109 CompletenessPanel — worker required sections (PROF-036)', () => {
  test('PROF-036 — empty worker profile lists ALL required sections (avatar, display_name, bio, location, rate, specialisation, portfolio, document)', () => {
    renderWithRouter(
      <CompletenessPanel
        isWorker={true}
        isEmployer={false}
        clientProfile={mockClientProfile({
          avatar_url: null,
          bio: null,
          display_name: '',
          city: null,
          postcode_area: null,
        })}
        workerProfile={mockWorkerProfile({
          day_rate_min: null,
          day_rate_max: null,
          worker_specialisations: [],
        })}
        hasPortfolioItem={false}
        hasUploadedDocument={false}
        onAction={() => {}}
      />,
    );
    expect(screen.getByText(/profile photo/i)).toBeInTheDocument();
    expect(screen.getByText(/display name/i)).toBeInTheDocument();
    expect(screen.getByText(/^bio$/i)).toBeInTheDocument();
    expect(screen.getByText(/city \+ postcode/i)).toBeInTheDocument();
    expect(screen.getByText(/day rate \(min and max\)/i)).toBeInTheDocument();
    expect(screen.getByText(/≥ 1 specialisation/i)).toBeInTheDocument();
    expect(screen.getByText(/≥ 1 portfolio item/i)).toBeInTheDocument();
    expect(screen.getByText(/≥ 1 verification document/i)).toBeInTheDocument();
  });

  test('PROF-035 — completeness percent reflects done/total ratio', () => {
    renderWithRouter(
      <CompletenessPanel
        isWorker={true}
        isEmployer={false}
        clientProfile={mockClientProfile({
          avatar_url: '/uploads/x.png', // done
          display_name: 'Mike',          // done
          bio: 'Hello',                  // done
          city: 'Camden',                // city + postcode → done
          postcode_area: 'NW1',
        })}
        workerProfile={mockWorkerProfile({
          day_rate_min: '200', // done
          day_rate_max: '350',
          worker_specialisations: [
            {
              specialisation_id: 1,
              is_primary: true,
              specialisation: { id: 1, name: 'Carpentry', slug: 'carpentry' },
            },
          ], // done
        })}
        hasPortfolioItem={false} // not done
        hasUploadedDocument={false} // not done
        onAction={() => {}}
      />,
    );
    // 6 of 8 done → 75 %
    expect(screen.getByText(/75% complete/i)).toBeInTheDocument();
    expect(screen.getByText(/6\/8 sections done/i)).toBeInTheDocument();
  });

  test('PROF-037 — clicking a card\'s CTA fires onAction with the right scroll/tab target', async () => {
    const onAction = vi.fn();
    renderWithRouter(
      <CompletenessPanel
        isWorker={true}
        isEmployer={false}
        clientProfile={mockClientProfile({ avatar_url: null })}
        workerProfile={mockWorkerProfile()}
        hasPortfolioItem={false}
        hasUploadedDocument={false}
        onAction={onAction}
      />,
    );
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: /add photo/i }));
    expect(onAction).toHaveBeenCalledWith({
      label: 'Add photo',
      scrollTo: 'section-avatar',
    });
  });

  test('PROF-036 — employer required sections include company_name + team_size', () => {
    renderWithRouter(
      <CompletenessPanel
        isWorker={false}
        isEmployer={true}
        clientProfile={mockClientProfile({
          worker_profile: null,
          employer_profile: mockEmployerProfile({ company_name: '', team_size: null }),
        })}
        employerProfile={mockEmployerProfile({ company_name: '', team_size: null })}
        hasPortfolioItem={false}
        hasUploadedDocument={false}
        onAction={() => {}}
      />,
    );
    expect(screen.getByText('Company name')).toBeInTheDocument();
    expect(screen.getByText('Team size')).toBeInTheDocument();
  });
});
