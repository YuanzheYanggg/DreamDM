# DreamDM

Local fantasy RPG prototype. This repository is independent of the earlier Jev/JCC experiment.

## Development

- Node.js 24 or newer, ES modules, native SQLite, no npm dependencies.
- Run `npm start` for the loopback-only UI at `http://127.0.0.1:4317/`.
- Run `npm test`; tests use injected fixtures and do not call live models.
- The current chapter contains six scenes and about five to six player choices. Do not describe the 100-choice budget as completed story content.
- Read `rpg-prototype/README.md` and `docs/superpowers/specs/2026-09-22-rpg-role-boundaries.md` before changing the DM contract.

## Runtime boundaries

- Astra authors and reviews scenes, choices, outcomes and future drafts.
- Jev receives bounded text/JSON state and selects authored consequences. It does not retrieve files, control the UI or review manuscript consistency each turn.
- Score describes risk tiers; Choice selects an allowed consequence; Noul signals uncovered future continuation needs. Optional planning must never rescind a committed action.
- The application validates resources, IDs, probabilities and versions, applies fortune once, and commits state atomically.
- Mainline proposals are currently unapplied. A prose change is not a compiled story-graph change.
- Preserve source-state checks, response caches, duplicate-request handling and separate budget buckets. Never hide retries or reset an existing budget to make a test pass.

## Credentials and local data

- `rpg-prototype/live/typesafe.mjs` reads `TYPESAFE_API_KEY` or the configured macOS Keychain service into process memory. Never print, log or commit credentials.
- Real AI preparation and choices can incur provider usage. Keep live validation bounded to the user-authorized scope; do not turn fixture tests into live requests.
- Never commit `runs/`, databases, player saves, raw provider receipts or `.env` files.
- Check listener ownership and pending jobs before replacing a local server. Preserve the player's current journey.
- For desktop UI validation use the available `mcp__cua_repl` interface. Do not archive screenshots by default.
