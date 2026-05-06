// TEST-VER-310..313 — MilestonesStrip component tests.
//
// Pin the public trust-signal projection: one badge per truthy flag, plus
// the reviews chip, plus per-cert-doc-type badge labels. Empty state must
// render nothing.

import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MilestonesStrip } from './MilestonesStrip';

describe('TEST-VER-310 MilestonesStrip — VER-093', () => {
  test('flag identity_verified → "Identity verified" badge', () => {
    render(<MilestonesStrip flags={{ identity_verified: true }} />);
    expect(screen.getByText(/Identity verified/i)).toBeInTheDocument();
  });

  test('flag insurance_approved → "Insurance approved" badge', () => {
    render(<MilestonesStrip flags={{ insurance_approved: true }} />);
    expect(screen.getByText(/Insurance approved/i)).toBeInTheDocument();
  });

  test('flag company_house_verified → "Companies House" badge', () => {
    render(<MilestonesStrip flags={{ company_house_verified: true }} />);
    expect(screen.getByText(/Companies House/i)).toBeInTheDocument();
  });

  test('flag company_letterhead_approved → "Letterhead approved" badge', () => {
    render(<MilestonesStrip flags={{ company_letterhead_approved: true }} />);
    expect(screen.getByText(/Letterhead approved/i)).toBeInTheDocument();
  });

  test('flag right_to_work_verified → "Right to work" badge', () => {
    render(<MilestonesStrip flags={{ right_to_work_verified: true }} />);
    expect(screen.getByText(/Right to work/i)).toBeInTheDocument();
  });

  test('flag hmrc_cis_verified → "HMRC CIS" badge', () => {
    render(<MilestonesStrip flags={{ hmrc_cis_verified: true }} />);
    expect(screen.getByText(/HMRC CIS/i)).toBeInTheDocument();
  });

  test('certification_doc_types renders one badge per type', () => {
    render(
      <MilestonesStrip flags={{ certification_doc_types: ['CSCS_CARD'] }} />,
    );
    expect(screen.getByText(/CSCS/)).toBeInTheDocument();
  });
});

describe('TEST-VER-311 MilestonesStrip reviews chip — VER-094', () => {
  test('count > 0 + average → renders the chip with average', () => {
    render(
      <MilestonesStrip
        flags={null}
        reviews={{ count: 8, average: 4.5 }}
      />,
    );
    expect(screen.getByText(/4\.5.*8 reviews/i)).toBeInTheDocument();
  });

  test('count > 0 with null average → renders the chip without average', () => {
    render(<MilestonesStrip flags={null} reviews={{ count: 1, average: null }} />);
    expect(screen.getByText(/1 review/i)).toBeInTheDocument();
  });

  test('count = 0 → no chip', () => {
    render(<MilestonesStrip flags={null} reviews={{ count: 0, average: null }} />);
    expect(screen.queryByText(/review/i)).not.toBeInTheDocument();
  });
});

describe('TEST-VER-312 MilestonesStrip empty state — VER-093', () => {
  test('all flags false + count=0 → renders nothing', () => {
    const { container } = render(
      <MilestonesStrip
        flags={{
          identity_verified: false,
          insurance_approved: false,
          company_house_verified: false,
          company_letterhead_approved: false,
          right_to_work_verified: false,
          hmrc_cis_verified: false,
          certification_doc_types: [],
        }}
        reviews={{ count: 0, average: null }}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  test('flags=null + reviews=null → renders nothing', () => {
    const { container } = render(
      <MilestonesStrip flags={null} reviews={null} />,
    );
    expect(container.firstChild).toBeNull();
  });
});

describe('TEST-VER-313 MilestonesStrip cert-doc-type label table — VER-094', () => {
  test.each([
    ['CSCS_CARD', 'CSCS'],
    ['GAS_SAFE_CERT', 'Gas Safe'],
    ['NICEIC_CERT', 'NICEIC'],
    ['FIRAS_CERT', 'FIRAS'],
  ])('%s → %s badge label', (docType, label) => {
    render(
      <MilestonesStrip flags={{ certification_doc_types: [docType] }} />,
    );
    expect(screen.getByText(new RegExp(label, 'i'))).toBeInTheDocument();
  });

  test('Unknown cert doc type falls back to the raw enum value', () => {
    render(
      <MilestonesStrip flags={{ certification_doc_types: ['NEW_CERT_2027'] }} />,
    );
    expect(screen.getByText(/NEW_CERT_2027/)).toBeInTheDocument();
  });
});
