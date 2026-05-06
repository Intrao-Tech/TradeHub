// TEST-VER-006 — canned Companies House registry fixtures.
//
// `globalThis.fetch` is mocked at the module boundary by every Companies
// House spec; these fixtures are the canonical request bodies + responses
// the tests pin behaviour against. The shapes mirror the slice of the real
// API response that `companies-house.service.ts` reads.

export type CompaniesHouseFixture = {
  status: number;
  body: Record<string, unknown> | null;
};

export const CH_FIXTURES = {
  /** Active company whose name matches "Acme Ltd" → MATCHED. */
  activeMatch(companyNumber = '12345678', name = 'Acme Limited'): CompaniesHouseFixture {
    return {
      status: 200,
      body: {
        company_name: name,
        company_status: 'active',
        company_number: companyNumber,
      },
    };
  },

  /** Active company with a name that won't match the user's submitted name. */
  activeNameMismatch(
    companyNumber = '12345678',
    name = 'FooBar Builders Limited',
  ): CompaniesHouseFixture {
    return {
      status: 200,
      body: {
        company_name: name,
        company_status: 'active',
        company_number: companyNumber,
      },
    };
  },

  /** Dissolved company → INACTIVE. */
  dissolved(companyNumber = '12345678', name = 'Acme Limited'): CompaniesHouseFixture {
    return {
      status: 200,
      body: {
        company_name: name,
        company_status: 'dissolved',
        company_number: companyNumber,
      },
    };
  },

  /** Registry 404 — company doesn't exist. */
  notFound(): CompaniesHouseFixture {
    return { status: 404, body: { errors: [{ error: 'company-profile-not-found' }] } };
  },

  /** Registry 500 — upstream error. */
  serverError(): CompaniesHouseFixture {
    return { status: 500, body: { error: 'internal' } };
  },

  /** Registry 401 — auth misconfigured. */
  authFailure(): CompaniesHouseFixture {
    return { status: 401, body: { error: 'invalid-authorization-header' } };
  },

  /** Malformed body — missing required fields. */
  malformed(): CompaniesHouseFixture {
    return { status: 200, body: { something_else: true } };
  },
};

/**
 * Patch `globalThis.fetch` to return a single fixture for the next call,
 * then restore the original. Returns the spy so tests can also assert on
 * the URL / headers the service called.
 */
export function mockNextFetch(
  fixture: CompaniesHouseFixture | (() => Promise<never> | never),
): jest.SpyInstance {
  const spy = jest.spyOn(globalThis, 'fetch' as never);
  if (typeof fixture === 'function') {
    spy.mockImplementationOnce(fixture as never);
  } else {
    spy.mockImplementationOnce(
      (async () =>
        ({
          status: fixture.status,
          ok: fixture.status >= 200 && fixture.status < 300,
          json: async () => fixture.body ?? {},
          text: async () =>
            fixture.body ? JSON.stringify(fixture.body) : '',
        }) as Response) as never,
    );
  }
  return spy;
}

/** Network error — the underlying fetch throws. */
export function mockFetchThrows(message = 'ECONNREFUSED'): jest.SpyInstance {
  return mockNextFetch(() => {
    throw new Error(message);
  });
}

export function restoreFetch(): void {
  jest.restoreAllMocks();
}
