// TEST-PROF-114 — RightToWorkSection (PROF-052).
//
// The component is gated on Verification's RTW backend (PROF-053): until
// the `RIGHT_TO_WORK_SHARE_CODE` doc_type + share-code metadata column
// land, Profiles cannot ship the share-code path frontend.  Per
// TEST-PROF-201 the tests stay `.skip` with a TODO citing the open
// dependency.

import { describe, test } from 'vitest';

describe('TEST-PROF-114 RightToWorkSection (PROF-052) [BLOCKED on Verification RTW backend]', () => {
  test.skip(
    'PROF-052 — share-code path validates `^W[A-Z0-9]{8}$` client-side',
    () => {
      // empty
    },
  );
  test.skip('PROF-052 — DOB picker accepts DD-MM-YYYY', () => {
    // empty
  });
  test.skip('PROF-052 — document path renders the file picker fallback', () => {
    // empty
  });
});
