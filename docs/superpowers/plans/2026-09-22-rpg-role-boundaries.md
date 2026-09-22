# RPG role boundary implementation plan

> Execution mode: user selected Superpowers Inline Execution. Continue in this session with executing-plans and checkpoint review. Authoring was delegated before that selection; subsequent work runs inline. Latest user-authored design supplies role approval. No Git repository, branch or publish task.

**Goal:** Astra owns authoring/review; Jev selects authored outcomes and exceptionally requests future replanning, without vetoing current play on story consistency probabilities.

**Architecture:** A dedicated authoring module builds evidence-bearing Astra review prompts. Engine projects each authored result into a bounded continuation context, uses typed Jev outcome/replan decisions, and preserves deterministic effects. Runtime commits before optional future work and publishes only Astra-reviewed future drafts. Existing budgets, saves and past receipts are retained.

**Tech stack:** Node.js, native SQLite, existing local HTML UI.

- [x] Authoring unit: add failing tests for complete versus missing/fabricated review evidence, cache identity and draft-specific constraints; implement `authorAudit(pack,{draft,history})` returning `{prompt,schema,signature,validate}`. No Jev calls inside authoring. Reuse current fixed world/transition contract.
- [x] Engine unit: tests first showing no consistent/consistency_case/patch_consistent/rewrite gates; low/uncertain planning Noul cannot stop a legal result; only the realized conditional result affects scheduling. Preserve Score metadata validation, costs, luck, and finite paths. Add continuation projections and a structured impacts record for states/side quests/conditions.
- [x] Runtime integration: prepare through Astra creation plus Astra review under opening; remove Jev preflight and ending exceptions. Background author review shares its director bucket and occurs before publication. Preserve raw-response caches, one fortune, idempotence, source-state checks and separate budget charging. Update fixtures and obsolete tests to the new user-approved responsibility contract.
- [x] Review: run unit tests red/green for each boundary, then full `npm test`, frontend syntax and fresh health checks. Inline specification and code-quality review of role compliance. Existing completed live game remains saved; no new billable calls needed for this architectural revision.
- [x] Restart only the verified local server owner after its jobs are idle. Verify existing scene and total budget unchanged. Update README, current QA and v4 design; explicitly separate tested behavior from future dynamic-story features.

Important assertions: `request.questions.consistent === undefined`; valid answers settle even with an obsolete extra Noul of zero; future planning thresholds never guard `applyResult`; missing typed result/invalid probability still fails; no Jev call during author review; optional writer budget failures cannot roll back committed progress; outdated drafts never overwrite shown scenes.

Checkpoint scope: uncovered continuation produces a separate Astra high proposal after action commit. Proposals remain unapplied until a graph compiler exists. Queued needs wait for an in-flight optional writer; stale source revisions are discarded.

Final inline checkpoints: 71 tests passed; syntax checks passed; actual CUA reload/save dialog confirmed; service healthy; sessions/events/calls/attempts/budgets hashes match before/after. Jev 14 and Astra 5 historical calls unchanged, zero new provider calls. No Git operations because this workspace is not a Git repository. QA records distinguish fixture contracts from untested live prompts and unapplied mainline graph proposals.
