# CLAUDE.md

Instructions for Claude Code in this repository.

## Start of every session

1. Read `handoff.md` before continuing any ongoing work.
2. Update `handoff.md` after every meaningful piece of work.

- Follow `REPO-HYGIENE.md`.

## Mandatory skills

Keep `ponytail`, `caveman` and `i-have-adhd` active all session. If one is unavailable, say so. Never pretend it is active.

## Documentation

Keep in sync with reality: `ARCHITECTURE.md` (mark unknowns "pending audit"), `DECISIONS.md` (record each significant decision), `CHANGELOG.md` (real changes only), `handoff.md` (state and next steps), audit/migration notes under `docs/`. Never invent details not found in the code.

## Coding and security

- Smallest complete change. Reuse before writing.
- Validate at trust boundaries. Handle errors that could lose data.
- `.env` is git-ignored. Commit `.env.template`, an exact copy that team members rename to `.env` after cloning (D-006, private repo; real values allowed). Keep both in sync. No signing keys (`*.pem`, `*.key`, keystores). Never hardcode secrets in source. Make the repo public only after purging them.
- Environment differences go in config and abstractions, not copied code.
- Keep lockfiles, migrations and docs under version control.
