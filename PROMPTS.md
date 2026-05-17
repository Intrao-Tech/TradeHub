# TradeHub Prompts

How I use Claude Code on TradeHub. Spec-Driven Development (SDD) loop:
`tasks/product/` → `tasks/in-progress/` → `tasks/done/`, with a sibling
`tests-<feature>/` folder for every shipped feature.

---

## 1. Writing a feature spec

I shape the product first (often with `surf` MCP for market validation),
then ask Claude to draft a numbered, end-to-end spec.

**Trigger prompt:**

> i need spec for `<feature>` to be end-to-end ready, so the next session can
> pick it up and start implementation. but i need to be sure we shape the
> product in the correct way as our product idea — use surf mcp to validate
> the product shape against real comparators before writing.

**Folder bootstrap prompt:**

> Open feature folder + brief + spec + contract for `<feature>`.
> Create `tasks/product/<feature>/` with:
> - `brief.md` — feature, problem, why now
> - `spec.md` — numbered `FEAT-NNN` IDs, Must / Should / Could acceptance
>   criteria, Open Questions, Decisions Log
> - `notes.md` — research, links, comparators
> - `contract.md` — sealed technical decisions for the implementation session

**Spec-writing instruction:**

> Write `spec.md` with `<FEAT>-NNN` IDs. Numbered SDD spec with Must / Should /
> Could acceptance criteria, Open Questions, Decisions Log.

---

## 2. Writing a tests spec

Every shipped feature gets a paired `tests-<feature>/` folder containing
`TEST-FEAT-NNN` cases mapped 1:1 to the feature's `FEAT-NNN` requirements.

**Trigger prompts:**

> did u include test specs/description for this?

> draft tests specs

> draft test specs also

**Output shape:**

- `brief.md` — why this exists, what feature shipped, what bugs surfaced
- `spec.md` — `TEST-AUTH-NNN` / `TEST-JOBS-NNN` / `TEST-VERIF-NNN` covering
  layers: U (unit) / E2E-B (backend e2e) / WS (websocket) / F (frontend) / PW
  (Playwright)
- `followups.md` — known production bugs surfaced by tests but deliberately
  not fixed in the test feature
- `status.md` — state, owner, dates

---

## 3. Executing implementation

Self-contained prompts pasted into a fresh session. Canonical shape:

> Implement the feature specified in `tasks/product/<feature>/spec.md`.
>
> **Read first, in order:**
> 1. `tasks/product/<feature>/spec.md` — your contract (`FEAT-NNN` requirements)
> 2. `tasks/product/<feature>/brief.md` — why this exists
> 3. `tasks/product/<feature>/contract.md` — sealed technical decisions
> 4. `CLAUDE.md` and `web/CLAUDE.md` — stack + design-system rules
>
> **Do:**
> - Move folder `product/` → `in-progress/`, update `status.md`
> - Plan slices, propose Slice A's PR scope
> - Use `EnterPlanMode` if the work needs more than a couple of files
> - Commit one logical step per commit (`feat(<feature>): …`)
> - If you make a decision that resolves an Open Question in `spec.md`, update
>   the spec in the same commit (move the question into a numbered
>   requirement, append a Decisions Log entry with today's date)
> - Pre-flight before declaring done:
>   ```
>   cd backend && npm run lint
>   cd web && npm run lint:tokens
>   cd web && ./node_modules/.bin/vite build
>   ```
> - Manual smoke: feature flows in light + dark, at 375px and desktop
> - On finish: move to `tasks/done/<feature>/`, update `status.md`
>   (state, started + shipped dates)
>
> **Do NOT:**
> - Write tests in this session — tests are a separate session per the next
>   prompt. The implementation must be testable (testID props, exported pure
>   helpers, swappable hooks), but no `*.spec.ts` / `*.test.tsx` files
> - Change auth / profiles / jobs / collaborations behaviour — reuse their
>   primitives only

---

## 4. Executing testing

Same shape, pointed at the tests folder. Direct example
(`tests-auth-flow`, 2026-05-03):

> **Prompt 1 — implement `tests-auth-flow`**
>
> Implement the test suite specified in
> `tasks/in-progress/tests-auth-flow/spec.md`.
>
> **Context to read first (in this order):**
> 1. `tasks/in-progress/tests-auth-flow/spec.md` — the full `TEST-AUTH-NNN`
>    requirement set you must satisfy. This is your contract.
> 2. `tasks/in-progress/tests-auth-flow/brief.md` — why this exists.
> 3. `tasks/done/auth-flow/spec.md` and the implementation it points at.
>
> **Closing instruction (always append):**
>
> When you finish, give me a short report:
> - Total green tests by layer (U / E2E-B / WS / F / PW)
> - Any followups opened
> - Any tests deliberately left failing or skipped (with their followup IDs)
> - Final coverage-matrix snapshot showing every `<FEAT>-NNN` has a green test
> - Update `status.md` (state, dates, green-test counts)

---

## The shared backbone

Every prompt is:

- **Self-contained** — paste into a fresh session and it has everything it
  needs (spec paths, contract paths, do/don't list, definition of done)
- **Anchored on a numbered contract** — `FEAT-NNN` for features,
  `TEST-FEAT-NNN` for tests; one acceptance criterion = one ID
- **Explicit about scope** — a `Do NOT` list prevents scope creep
- **Driven by folder state** — `product/` → `in-progress/` → `done/`, with
  `status.md` updated at every transition
- **Committed in slices** — one logical step per commit, conventional commit
  prefix (`feat(<feature>):`, `fix(<feature>):`, `chore(<feature>):`)
- **Closed by a structured report** — green-test counts, followups,
  coverage-matrix snapshot

The spec is the contract. The folder state is the truth. The report is the
handoff.
