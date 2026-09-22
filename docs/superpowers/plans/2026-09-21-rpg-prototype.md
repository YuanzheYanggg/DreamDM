# RPG Interface Prototype Implementation Plan

**Goal:** Deliver a locally playable HTML prototype with branching choices, character and inventory updates, callback of an earlier decision, and save/resume.

**Architecture:** Independent `rpg-prototype/` directory. A pure local story/state module drives the browser view. A small Node HTTP server serves only prototype public files on loopback. No Jev/Astra calls or phone control are needed for this prototype.

**Tech Stack:** Native HTML/CSS/ES modules, localStorage, Node 22+ built-in HTTP and test runner.

## Implementation tasks

- [x] State and story: `rpg-prototype/game.mjs`. Expose `newGame(seed)`, `sceneFor(state)`, `choose(state, id, expectedRevision)`, `useItem(state, id, expectedRevision)`, `serializeSave(state)`, `restoreSave(text)`. State contains a versioned world identifier, turn revision, current scene, character, inventory, flags, known clues, journey and recorded changes. Choices resolve through this module exclusively. Advance only when the revision and current choice match. Return a new state without mutating the old one.
- [x] Meaningful state tests: `rpg-prototype/game.test.mjs`. Verify that the opening decision later unlocks a different option; stale submission fails; purchasing and consuming change quantities once; export/import preserves state; unsupported or malformed saves fail; every finite story branch reaches an ending with bounded resources.
- [x] Interface: `rpg-prototype/index.html`, `styles.css`, `app.mjs`. Implement the generated reference with code-native typography, compass and item icons. Story/journey tabs, accessible choices, live character sidebar, item inspection and food use, save/import/export/restart dialog. Handle unavailable storage and import errors visibly. Respect reduced motion and collapse the sidebar on narrow screens.
- [x] Preview: `rpg-prototype/server.mjs`. Serve an explicit public-file allowlist from 127.0.0.1, use a configurable port, no credentials or unrelated workspace exposure.
- [x] Verify and document: run `node --test rpg-prototype/game.test.mjs`, then required `npm test`; inspect and click the running UI via CUA, verify resume and narrow layout. Record actual coverage and visual deviations in `rpg-prototype/QA.md`; document the launch command and prototype limitations in `rpg-prototype/README.md`.

## Acceptance

The user can open the local URL, make a meaningful choice, see persistent character/inventory changes, reach a callback unlocked by the earlier decision, and finish a short story. The installed interface remains a local scripted prototype, with no claim of live AI generation.

## Repository handling

The supplied directory has no Git repository. Preserve the existing JCC implementation and tests; no Git initialization or synthetic commit is required.
