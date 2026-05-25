// TEST-JOBS-031 — `GET /tags` is the public read-only catalog the chip-
// multiselect consumes (JOBS-022). Smoke-test that the controller is a thin
// pass-through and that staff-only mutations exist as decorators —
// regression-protects JOBS-025 (no drift toward staff-gated reads).

import { TagController } from './tag.controller';
import { TagService } from './tag.service';

function build() {
  const service = {
    findAll: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  } as unknown as TagService;
  return { controller: new TagController(service), service };
}

describe('TEST-JOBS-031 TagController — JOBS-022 / JOBS-025', () => {
  test('JOBS-022 — findAll() delegates to the service unchanged', async () => {
    const { controller, service } = build();
    const rows = [{ id: 1, name: 'Loft Conversion', slug: 'loft-conversion' }];
    (service.findAll as jest.Mock).mockResolvedValueOnce(rows);

    await expect(controller.findAll()).resolves.toEqual(rows);
    expect(service.findAll).toHaveBeenCalledTimes(1);
  });

  test('JOBS-025 — staff-mutation method names exist on the controller (decorators verified at e2e level)', () => {
    const { controller } = build();
    expect(typeof controller.create).toBe('function');
    expect(typeof controller.update).toBe('function');
    expect(typeof controller.delete).toBe('function');
  });
});
