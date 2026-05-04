// TEST-PROF-115 — StripeConnectStatus (PROF-041 / PROF-042 / PROF-043).
//
// Gated on BE-PROF-7 (POST /worker-profiles/me/stripe-connect/onboarding-link).
// Backend `stripe/` module today has only `stripe.module.ts` — no controller
// and no service.  Per TEST-PROF-201 these tests stay `.skip`.

import { describe, test } from 'vitest';

describe('TEST-PROF-115 StripeConnectStatus (PROF-041 / PROF-042 / PROF-043) [BLOCKED on BE-PROF-7]', () => {
  test.skip(
    'PROF-041 — "Set up payouts" CTA when stripe_onboarding_complete === false',
    () => {
      // empty
    },
  );
  test.skip(
    'PROF-042 — "Payouts ready" with masked id when complete',
    () => {
      // empty
    },
  );
  test.skip(
    'PROF-043 — read-only state with no CTA when BE-PROF-7 not yet available',
    () => {
      // empty
    },
  );
});
