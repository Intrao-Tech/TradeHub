// TEST-REVIEW-013 — CreateReviewDto class-validator constraints (REVIEW-012).
//
// Drives the DTO through class-transformer + class-validator the same way
// `ValidationPipe` does in production, so the comment ceiling and overall
// rating bounds are locked at the schema layer rather than the service.

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateReviewDto } from './create-review.dto';

async function validateDto(payload: Record<string, unknown>) {
  const dto = plainToInstance(CreateReviewDto, payload);
  return validate(dto);
}

describe('TEST-REVIEW-013 CreateReviewDto — REVIEW-012 class-validator constraints', () => {
  test('TEST-REVIEW-013 / REVIEW-012 — overall_rating 1..5 accepted', async () => {
    for (const r of [1, 2, 3, 4, 5]) {
      const errors = await validateDto({ overall_rating: r });
      expect(errors).toEqual([]);
    }
  });

  test('TEST-REVIEW-013 / REVIEW-012 — overall_rating 0 / 6 rejected', async () => {
    const e0 = await validateDto({ overall_rating: 0 });
    const e6 = await validateDto({ overall_rating: 6 });
    expect(e0.length).toBeGreaterThan(0);
    expect(e6.length).toBeGreaterThan(0);
  });

  test('TEST-REVIEW-013 / REVIEW-012 — comment exactly 5000 chars accepted', async () => {
    const errors = await validateDto({
      overall_rating: 5,
      comment: 'x'.repeat(5000),
    });
    expect(errors).toEqual([]);
  });

  test('TEST-REVIEW-013 / REVIEW-012 — comment > 5000 chars rejected by @MaxLength', async () => {
    const errors = await validateDto({
      overall_rating: 5,
      comment: 'x'.repeat(5001),
    });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('maxLength');
  });

  test('TEST-REVIEW-013 / REVIEW-012 — sub-ratings each constrained to 1..5', async () => {
    for (const field of [
      'quality_rating',
      'reliability_rating',
      'communication_rating',
      'payment_rating',
      'safety_rating',
    ] as const) {
      const ok = await validateDto({ overall_rating: 5, [field]: 3 });
      expect(ok).toEqual([]);
      const tooLow = await validateDto({ overall_rating: 5, [field]: 0 });
      expect(tooLow.length).toBeGreaterThan(0);
      const tooHigh = await validateDto({ overall_rating: 5, [field]: 6 });
      expect(tooHigh.length).toBeGreaterThan(0);
    }
  });
});
