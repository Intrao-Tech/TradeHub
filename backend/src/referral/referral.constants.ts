export const REFERRAL_TYPE = {
  ACCOUNT: 'ACCOUNT',
  PROJECT_W2W: 'PROJECT_W2W',
  // Retained for historical mail/ledger rows only — no new E2E referrals.
  PROJECT_E2E: 'PROJECT_E2E',
} as const;
export type ReferralType = (typeof REFERRAL_TYPE)[keyof typeof REFERRAL_TYPE];

// Excludes ambiguous chars (0/O/1/I/L) for human-typed clarity.
export const REFERRAL_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const REFERRAL_CODE_REGEX =
  /^[A-HJ-KM-NP-Z2-9]{4}-[A-HJ-KM-NP-Z2-9]{4}$/;

export const REFERRAL_AUDIT_EVENTS = {
  ACCOUNT_ATTRIBUTED: 'referral.account.attributed',
  PROJECT_ATTRIBUTED: 'referral.project.attributed',
  COMMISSION_PAID: 'referral.commission.paid',
  COMMISSION_FAILED: 'referral.commission.failed',
} as const;

export function generateReferralCode(): string {
  const pick = () =>
    REFERRAL_CODE_ALPHABET[
      Math.floor(Math.random() * REFERRAL_CODE_ALPHABET.length)
    ];
  let out = '';
  for (let i = 0; i < 4; i++) out += pick();
  out += '-';
  for (let i = 0; i < 4; i++) out += pick();
  return out;
}
