# Markdown Task System

## Folder Structure

```text
tasks/
  GUIDE.md
  product/
  in-progress/
  done/
```

- `product/` contains features being defined.
- `in-progress/` contains features currently being implemented.
- `done/` contains shipped features for history and reference.

## Core Rule

One feature = one folder.

Each feature folder should move as a whole through the workflow:

`product` -> `in-progress` -> `done`

Do not split one feature across multiple unrelated folders.

## Feature Folder Naming

Use `kebab-case` for folder names.


## Required Files In Every Feature Folder

Each feature folder should contain these Markdown files:

- `brief.md`
- `spec.md`
- `status.md`

Optional:

- `notes.md`

## File Purpose

### `brief.md`

Written by the product owner.

Contains the raw feature intent in simple language:

- problem
- goal
- users
- expected outcome
- constraints

### `spec.md`

Refined with LLM help.

This is the implementation-ready spec the developer and AI should follow.

Use the same section order every time:

1. Summary
2. Problem
3. Goals
4. Non-goals
5. User Flow
6. Requirements
7. Edge Cases
8. Acceptance Criteria
9. Open Questions

### `status.md`

Tracks ownership and history.

Use it to record:

- current state
- owner
- created date
- last updated date
- implementation notes
- shipped date

### `notes.md`

Optional working notes for development.

Use it for:

- technical decisions
- links to PRs or commits
- migration notes
- follow-up work

## Workflow

### 1. Product Definition

Create a new folder inside `tasks/product/`.

Example:

```text
tasks/product/referral-inbox/
```

Add:

- `brief.md`
- `spec.md`
- `status.md`

### 2. Start Development

When a developer starts the task:

- move the whole feature folder to `tasks/in-progress/`
- keep the same file names
- update `status.md` with owner and start date

### 3. Ship And Archive

When the work is finished:

- move the whole feature folder to `tasks/done/`
- update `status.md` with result and shipped date

## Working Principles

- **Specs are living documents.** When a decision is made on an active
  feature (Open Question answered, scope changed, requirement clarified),
  update the relevant `spec.md` in the same step — move the resolved item
  out of `Open Questions` into a numbered requirement, and append the
  decision + date to a `Decisions Log` section at the bottom. The repo
  state must always match the spec; out-of-date specs are bugs.
- **Every shipped feature folder in `tasks/done/` should have a test
  counterpart in `tasks/done/`** (named `tests-<feature>/`). If you ship a
  feature without tests, open a `tests-<feature>` spec the same week and
  move it to `in-progress` immediately. The pattern is established by
  `tasks/done/tests-auth-flow/` (covers the sealed `tasks/done/auth-flow/`
  contract).

## Consistency Rules For AI Work

To get similar output from different models, keep these rules strict:

- always use the same folder structure
- always use the same file names
- always use the same section order in `spec.md`
- write explicit acceptance criteria
- list assumptions clearly
- separate goals from non-goals
- move folders, do not duplicate them

## Suggested Templates

### `brief.md`

```md
# Brief

## Feature

## Problem

## Goal

## Users

## Expected Outcome

## Constraints
```

### `spec.md`

```md
# Spec

## Summary

## Problem

## Goals

## Non-goals

## User Flow

## Requirements

## Edge Cases

## Acceptance Criteria

## Open Questions
```

### `status.md`

```md
# Status

- State: product
- Owner:
- Created:
- Last Updated:
- Shipped:

## Notes
```

