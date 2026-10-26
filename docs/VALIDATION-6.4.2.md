# v6.4.2 validation

Verified 16 October 2026. Project: HSS Planner.

| Requirement | Authoritative evidence | Result |
| --- | --- | --- |
| Student-focused mission | [Mission](MISSION.md) | Daily planning, progress tracking and recovery; no independent-adoption claim |
| Public open source and maintained release | Public GitHub API reports MIT, created 19 September 2026; [v6.4.2](https://github.com/sreyasts/hss-planner/releases/tag/v6.4.2) targets `8bf98777f93364ee78906874e510f4b0b91bcecb` | Verified public release |
| Remove floating feature entirely | `src/app.js`, `index.html`, `src/style.css`; live rendered app | Timer, overlay, picture-in-picture and completion popups removed |
| Practical daily UI | `tests/e2e/study-flow.spec.js`, `tests/e2e/calendar-view.spec.js`; live desktop inspection | Compact task rows, completion/undo, expandable resources; Today/pending/tomorrow separated |
| Date rollover and persistence | Calendar browser scenario changes local date, reloads and completes overdue work | Passed |
| Offline and bilingual setup | `tests/e2e/offline.spec.js` checks built cache assets and interactive offline language switching | Passed |
| Automated verification | [CI for the release commit](https://github.com/sreyasts/hss-planner/actions/runs/38893378991) | Lint, 93 unit tests, 553 planner checks, benchmarks, production build and 5 Chromium scenarios pass |
| Deployment | Firebase CLI successful release and live inspection; [Pages deployment](https://github.com/sreyasts/hss-planner/actions/runs/38893379002) | Both deployments succeeded |

Removing the feature also removed eight tests that asserted its source structure. Browser checks now exercise completion, undo, persistence, tutor links and absence of floating controls at 390px and 1280px. These checks do not validate authenticated cloud sync, all browsers, curriculum accuracy, educational outcomes or statutory compliance.
