# Brief

## Feature

Profiles foundation for TradeHub MVP — the surface that turns the product from a working backend into a credible B2B trades reputation network.

## Problem

TradeHub is positioned as **trust infrastructure for UK construction trades** — a professional network where reputation, verification, and accountability are the core product, not a side feature. The backend already exposes profile, portfolio, and document endpoints, but the frontend is an internal tool: account state renders as a `<pre>` JSON block, the only way to choose an avatar is to paste a URL, portfolio items cannot be edited, and there is no public profile to send to a prospective collaborator. There is no detail page for a worker or employer, and the public client directory is not wired up at all.

This is a product-level mismatch: every other feature on the roadmap (referral exchange, labour database, reviews, escrow) depends on a tradesperson having a profile worth referring to and an employer having a profile worth being reviewed. Without that, the rest of the platform cannot earn the trust the product is meant to sell.

## Goal

Define one production-ready Profiles feature that gives every TradeHub role a real, public, link-shareable presence and a self-service surface to maintain it:

- public worker / employer / client profile pages
- in-app profile editing for self (display, bio, location, role-specific fields)
- avatar upload with crop and preview
- portfolio CRUD including media and document linkage (workers)
- document upload, status visibility, and staff review queue
- profile completeness indicator on own profile
- search detail entry points (clickable cards → full profile)
- Stripe Connect payout onboarding for workers (read-only state in MVP)

## Users

- Self-Employed Tradesperson (worker)
- Labourer (worker — sub-category, reuses worker profile)
- Company (employer)
- Client (read-only public consumer of profiles)
- Staff / Moderator (verification queue, document review)

## Expected Outcome

A new user can sign up, fill out their profile to a "credible enough to refer" state in one sitting, share a public URL, and have a recognisable, verifiable presence on the platform. A staff moderator can review document submissions and move profiles up the verification ladder without touching the database. Two referring tradespeople can look at each other's profiles before a handshake and see the same trust signals. The spec must be implementable by a separate frontend track without colliding with the in-flight Auth feature (`tasks/product/auth-flow/`).

## Constraints

- Backend profile endpoints already exist — do not redesign them; consume what is there and only extend where genuinely needed (avatar upload, portfolio media upload, role-activation).
- Use the existing design system: semantic tokens, shadcn primitives, `AppShell`, `WorkerCard` / `EmployerCard` / `VerificationBadge` / `StarRating` / `EmptyState` (`web/CLAUDE.md`).
- Reuse the existing Multer upload pipeline (`/uploads/{uuid}.{ext}`) — do not introduce S3 / presigned URLs in MVP.
- Do not duplicate Auth scope: account state, email verification, password recovery, role selection at signup, session lifecycle all belong to `auth-flow`. Profiles consumes the auth contract.
- Greater London soft launch only — region picker scope is `London boroughs` per the product spec.
- Keep verification ladder vocabulary aligned with the product spec (`Unverified → Basic → Certified → Premium`), not the legacy code names (`UNVERIFIED / KYC / REVIEWED / HMRC`). Reconciliation is in-scope for this feature.
