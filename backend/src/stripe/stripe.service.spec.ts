// TEST-PROF-040 — StripeService.createConnectOnboardingLink unit spec.
//
// BE-PROF-7 (POST /worker-profiles/me/stripe-connect/onboarding-link) has NOT
// shipped at the time of writing — `backend/src/stripe/` contains only
// `stripe.module.ts` (DI wiring for the Stripe SDK) and no controller / no
// service. Per TEST-PROF-201 these tests stay `.skip` with a TODO citing
// the open prerequisite, ready to flip live the moment the endpoint lands.

describe('TEST-PROF-040 Stripe Connect onboarding link (PROF-041, BE-PROF-7)', () => {
  test.skip(
    'BE-PROF-7 — TODO: returns { url, expires_at } for a worker without stripe_connect_account_id. ' +
      'Currently no service exists; module exports only a Stripe client provider. ' +
      'Citation: tasks/in-progress/profiles/spec.md PROF-041 / BE-PROF-7; tests-profiles spec TEST-PROF-201.',
    async () => {
      // Will become live when BE-PROF-7 ships StripeService.createConnectOnboardingLink().
    },
  );

  test.skip(
    'BE-PROF-7 — TODO: returns the same shape for a worker with an incomplete account. ' +
      'See PROF-041.',
    async () => {
      // empty
    },
  );

  test.skip(
    'BE-PROF-7 — TODO: returns 400 / structured error for an already-complete account. ' +
      'See PROF-042.',
    async () => {
      // empty
    },
  );
});
