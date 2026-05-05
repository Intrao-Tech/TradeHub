-- Data migration: align `client_profile.verification_level` with the
-- product-spec ladder vocabulary (Unverified / Basic / Certified / Premium).
-- The legacy `IDENTITY_VERIFIED` value (only ever written by the Stripe
-- webhook pre-Verification feature) maps to BASIC. Anything else legacy
-- (`KYC`, `REVIEWED`, `HMRC`, etc.) maps to UNVERIFIED — those values had no
-- product meaning and were never written anywhere except in seed data
-- experiments.

UPDATE "client_profile" SET "verification_level" = 'BASIC'
  WHERE "verification_level" IN ('IDENTITY_VERIFIED', 'COMPANY_VERIFIED');

UPDATE "client_profile" SET "verification_level" = 'UNVERIFIED'
  WHERE "verification_level" NOT IN ('UNVERIFIED', 'BASIC', 'CERTIFIED', 'PREMIUM');
