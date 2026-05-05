// TEST-PROF-079 — stripe-connect e2e (PROF-041, BE-PROF-7).
//
// BE-PROF-7 (POST /worker-profiles/me/stripe-connect/onboarding-link) has
// not shipped — `backend/src/stripe/` contains only `stripe.module.ts`
// (no controller, no service, no routes).  Per TEST-PROF-201 the spec is
// `.skip` with a TODO until Verification's sibling backend track lands.

describe('TEST-PROF-079 Stripe Connect onboarding link e2e (PROF-041, BE-PROF-7)', () => {
  test.skip(
    'BE-PROF-7 — TODO: POST /worker-profiles/me/stripe-connect/onboarding-link returns { url, expires_at }. ' +
      'No controller exists today; module wires only the Stripe SDK client. ' +
      'Citation: tasks/in-progress/profiles/spec.md PROF-041 / BE-PROF-7.',
    () => {
      // empty
    },
  );

  test.skip('BE-PROF-7 — TODO: idempotent on re-call (same url returned for the same incomplete account).', () => {
    // empty
  });
});
