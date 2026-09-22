# RPG live slice implementation plan

> Execution: approved v3 design, implement in this session with focused tests. No Git repository is present; no commit or publish is requested.

Goal: make the accepted HTML prototype actually use Codex/Astra preparation and background rewriting, and Jev Score/Noul/Choice for each story action, with SQLite state and exactly one fortune per action.

Architecture: a six-scene finite chapter has local, bounded mechanics and a complete fallback route. Astra supplies all scene, choice and outcome prose before live play. Jev chooses conditional outcomes; the server applies luck and atomic effects. Background Astra work only changes future, unpublished prose, never blocks a player result and never changes state mechanics. This slice tests the loop; it is not the proposed 100-choice world or distributable skill bundle yet.

Files: live/world.mjs holds the scene and effect contract; live/engine.mjs builds questions and applies results; live/providers.mjs runs CLI and Jev; live/runtime.mjs owns SQLite and jobs; server.mjs exposes same-origin API; app.mjs adapts the accepted app. Original demo stays playable.

- [x] Add meaningful failing tests: luck partitions, illegal answer, secret projection, stale and duplicate calls, pending fortune across failure, background result not on action path.
- [x] Implement fixed scene/effect contract and Astra JSON schema. Validate every generated ID and string, preserve scene routes and resource bounds.
- [x] Implement Jev typed questions with outcome Score, consistency Noul and one conditional Choice per tier. Use full Score distribution; keep luck and fortune out of its request.
- [x] Implement SQLite persistence and immutable action receipts. Reject duplicate/stale actions before provider calls; no automatic retries.
- [x] Implement tool-free, ephemeral Codex subprocess using logged-in ChatGPT and gpt-6-astra; disable provider retries. Record metadata, safe errors and outputs without credentials.
- [x] Connect UI through same-origin asynchronous jobs. Live saves on server; original browser demo save remains separate. Show luck and actual adjudication; preserve prepared scenes during background jobs.
- [x] Run npm test, browser checks through CUA only, and bounded real validation (initial 3 Codex / 2 Jev cap superseded by the user-authorized whole-game allocation on 2026-09-22). Keep the verified service running and document actual latencies and limitations.

Validation commands: `node --test rpg-prototype/live/*.test.mjs`, then `npm test`. Provider tests use injected local answers, never real calls. Real calls are initiated deliberately from the local UI and counted from SQLite request records, including failed attempts.

Initial validation note (superseded by whole-game validation below, 2026-09-22): 33 tests passed; bounded real calls completed, but Jev did not clear the initial chapter. Astra editorial repair is ready for explicit recheck. Browser shows this pending state honestly. Real click settlement and background generation remain unverified; do not mark final validation complete until performed. See rpg-prototype/QA.md.

Whole-game follow-up (2026-09-22): real five-choice ending and one nonblocking background medium job verified. The director draft arrived after its target was visited and was discarded; real approved-draft publication is still covered by fixtures only. Jev 14 and Codex 5 attempts used, within 130/18 allocation. 59 tests passed. Fixed-ending authority and held action repairs are documented in QA; this was not an uninterrupted stability run.
