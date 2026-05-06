// TEST-COLLAB-015 — CollaborationController unit specs.
//
// Covers the controller-side guards that live OUTSIDE the service:
//   - rejecting both worker_id + employer_id together
//   - rejecting employer_id when caller is not a worker
//   - rejecting worker_id when caller is not an employer
//   - rejecting neither set
// These checks exist in `collaboration.controller.ts:47-82` and the e2e
// suite would mask them as plain 400s — the unit spec ties each branch to
// its source line.

import { BadRequestException } from '@nestjs/common';
import { CollaborationController } from './collaboration.controller';
import type { CollaborationService } from './collaboration.service';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';

const WORKER_ID = 11n;
const EMPLOYER_ID = 22n;

function buildService(): CollaborationService {
  return {
    create: jest.fn().mockResolvedValue({ id: 1n }),
    getByIdForUser: jest.fn(),
    getByUser: jest.fn(),
    updateStatus: jest.fn(),
    flag: jest.fn(),
    getById: jest.fn(),
  } as unknown as CollaborationService;
}

function user(overrides: Partial<CurrentUserPayload> = {}): CurrentUserPayload {
  return {
    accountId: WORKER_ID,
    email: 'a@b.io',
    clientProfileId: WORKER_ID,
    isWorker: true,
    isEmployer: false,
    isStaff: false,
    staffRole: null,
    verificationState: 'ACTIVE',
    ...overrides,
  };
}

describe('TEST-COLLAB-015 CollaborationController.create() — COLLAB-030 controller-side guards', () => {
  test('TEST-COLLAB-015 — both worker_id and employer_id provided → BadRequestException', () => {
    const ctrl = new CollaborationController(buildService());
    expect(() =>
      ctrl.create(user(), {
        worker_id: Number(WORKER_ID),
        employer_id: Number(EMPLOYER_ID),
      }),
    ).toThrow(BadRequestException);
  });

  test('TEST-COLLAB-015 — employer_id set but caller is not a worker → BadRequestException', () => {
    const ctrl = new CollaborationController(buildService());
    expect(() =>
      ctrl.create(user({ isWorker: false, isEmployer: true }), {
        employer_id: Number(EMPLOYER_ID),
      }),
    ).toThrow(BadRequestException);
  });

  test('TEST-COLLAB-015 — worker_id set but caller is not an employer → BadRequestException', () => {
    const ctrl = new CollaborationController(buildService());
    expect(() =>
      ctrl.create(user({ isWorker: true, isEmployer: false }), {
        worker_id: Number(WORKER_ID),
      }),
    ).toThrow(BadRequestException);
  });

  test('TEST-COLLAB-015 — neither worker_id nor employer_id → BadRequestException', () => {
    const ctrl = new CollaborationController(buildService());
    expect(() => ctrl.create(user(), {})).toThrow(BadRequestException);
  });

  test('TEST-COLLAB-015 — caller without clientProfileId → BadRequestException', () => {
    const ctrl = new CollaborationController(buildService());
    expect(() =>
      ctrl.create(user({ clientProfileId: null }), {
        employer_id: Number(EMPLOYER_ID),
      }),
    ).toThrow(BadRequestException);
  });

  test('TEST-COLLAB-015 — worker initiating with employer_id → delegates to service.create()', () => {
    const service = buildService();
    const ctrl = new CollaborationController(service);
    ctrl.create(user(), { employer_id: Number(EMPLOYER_ID) });
    expect(service.create).toHaveBeenCalledWith(
      { employer_id: Number(EMPLOYER_ID) },
      'WORKER',
      WORKER_ID,
    );
  });

  test('TEST-COLLAB-015 — employer initiating with worker_id → delegates to service.create()', () => {
    const service = buildService();
    const ctrl = new CollaborationController(service);
    ctrl.create(
      user({ clientProfileId: EMPLOYER_ID, isWorker: false, isEmployer: true }),
      { worker_id: Number(WORKER_ID) },
    );
    expect(service.create).toHaveBeenCalledWith(
      { worker_id: Number(WORKER_ID) },
      'EMPLOYER',
      EMPLOYER_ID,
    );
  });
});
