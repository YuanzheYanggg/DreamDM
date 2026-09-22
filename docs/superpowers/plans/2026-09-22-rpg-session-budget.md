# Whole-session RPG budget implementation plan

> Execute inline with superpowers:executing-plans. User authorized allocating attempts for a complete game; no new per-request permission gates within this session budget. No Git repository is present.

**Goal:** Persist and enforce a full-game attempt budget, retain prior charges, and finish the existing six-scene real-provider trial.

**Architecture:** `live/budget.mjs` owns versioned bucket limits, call reservation and accounting in SQLite. `Runtime.logged` reserves before dispatch. Active budget follows preparation through play; a user-started new journey creates a new budget, preparation retry or save import does not refill it. Old background requests retain their original budget ID. UI shows used/maximum and buckets in the save dialog.

**Tech Stack:** Existing Node.js, SQLite, browser JavaScript; no dependencies.

Policy for a planned 100-choice game: Jev 130 = preflight 6 + action 100 + checkpoint 4 + recovery 20. Codex 18 = opening 4 + director_low 6 + director_medium 4 + director_high 2 + repair 2. These are attempt limits, not a currency cap or mandatory consumption. A request with multiple questions counts once. Failed/uncertain attempts remain charged; a rejected reservation never calls the provider. No automatic retries. Optional background writing stops when its own allowance is spent and prepared routes remain usable. Current chapter is still 5–6 choices.

- [x] Add failing tests in `live/budget.test.mjs`: in-flight reservation prevents overspend; errors stay charged; restart/import preserve accounting; legacy calls migrate once; limits isolate providers and purposes.
- [x] Implement the budget ledger and migration. Every immutable call record retains budget ID and bucket across running/done/error updates. Snapshot reports per-session and lifetime counts plus observed token totals.
- [x] Wire prepare/action/retry/director call purposes. Capture budget ID on jobs; new-game starts renew only after an existing session, not failed preparation. Keep imports on current account. Treat optional writing exhaustion as director status, never roll back a committed action.
- [x] Show current budget in the existing save dialog without exposing provider details in story prose.
- [x] Run local tests, restart the verified port owner, then use CUA to recheck repaired chapter and play to a real ending within the new game budget. Investigate semantic holds with concrete evidence; no blind repeated checks or lowered gates merely to pass.
- [x] Update README, QA and the budget policy document with actual use, remaining capacity and limitations.

Execution result: 59 local tests passed. Real five-choice game completed after two action-context/rule revisions. Jev 14/130, Codex 5/18 including earlier attempts; no category overage. Final resolution reused the cached Jev response under a revalidated fixed-ending authority, not a new billed request. See rpg-prototype/QA.md for the explicit adjudication policy change and evidence limits.
