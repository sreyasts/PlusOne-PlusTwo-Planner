# Project: +1 & +2 Planner Simulation, Stress-Testing & Defect Resolution

## Architecture
- **Application Type**: Zero-runtime-dependency Vanilla JavaScript (ESM) Single Page Application (SPA), served by Vite.
- **Core Scheduler** (`src/core/scheduler.js`): Framework-agnostic scheduling engine, Ebbinghaus forgetting curve spaced retrieval, prerequisite chaining, revision buffer allocation (0–10 days), exam eve quarantine.
- **Web Planner Bridge** (`src/engine/planner.js`): Integration layer normalizing state formats, schema migration (`src/engine/migration.js`), plan validation invariants (`validatePlan`).
- **UI Controller** (`src/app.js`): Central state machine (`appState`), dynamic view renderer (`renderApp()`), event handlers for task toggling, setup wizard, plan adjustments, backup export/import.
- **Data Layer** (`src/data/`): Kerala SCERT Scheme of Work for +1 (`syllabus-plus-one.js`) and +2 (`syllabus-plus-two.js`) across 13 subjects and 575 atomic task units.
- **Persistence Layer** (`src/utils/study-backup.js`, `src/utils/study-progress.js`): LocalStorage dual-key atomic persistence (`plusTwoMissionState_v2`, `plusTwoPlanState`) with rollback protection and sanitized JSON export/import.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| F1 | 8-Combination Full Simulation | Multi-day programmatic simulation (Day 1 -> 100% completion) across +1/+2 CS, Bio, Commerce, Humanities | M1 | ORIGINAL_REQUEST §R1 |
| F2 | Pacing Presets Verification | Verify zero dropped, skipped, duplicated or orphaned chapters across 30d, 60d, Christmas, Board presets | M1 | ORIGINAL_REQUEST §R1 |
| F3 | Missed Days Disruption (1-14d) | Verify pending drawer segregation, overdue tasks handling, and plan rebalancing under 1-14 missed days | M2 | ORIGINAL_REQUEST §R2 |
| F4 | "Adjust Plan" Rebalance Resilience | Freeze completed days and rebalance remaining work smoothly to target deadline | M2 | ORIGINAL_REQUEST §R2 |
| F5 | Past-Deadline Rebalance Guard | Gracefully handle rebalancing when rebuild start date >= target deadline without throwing uncaught errors | M2, M4 | Survey E1, E3 / §R2 |
| F6 | Calendar & Timezone Boundaries | Verify leap years (2028-02-29 vs 2026/2027), negative UTC timezone offsets in countdown, month boundaries | M2, M4 | Survey E3 / §R2 |
| F7 | Mid-Journey Reconfiguration | Safe handling of grade switch (+1 <-> +2), stream switch, study hours change, and rest day adjustments | M2 | ORIGINAL_REQUEST §R2 |
| F8 | Plan View Task Toggle Sync | Update day card completion counts and overall progress dynamically when checking tasks in 'plan' view | M3, M4 | Survey E3 / §R3 |
| F9 | Plus One Syllabus View Fix | Dynamically select PLUS_ONE_SYLLABUS or PLUS_TWO_SYLLABUS in syllabus reference view based on user grade | M3, M4 | Survey E2 / §R3 |
| F10 | Engine Version Harmonization | Harmonize PLANNER_ENGINE_VERSION (5 -> 6) so v6 migrated states import cleanly without TypeError | M3, M4 | Survey E3 / §R3 |
| F11 | 100% Syllabus Mastery Celebration | Trigger full celebration banner, achievement state, and zero-dependency confetti fallback on 100% syllabus mastery | M3, M4 | Survey E3 / §R3 |
| F12 | Offline PWA Storage & Export/Import | LocalStorage dual-key rollback resilience and bit-for-bit JSON backup/restore roundtrip fidelity | M3 | ORIGINAL_REQUEST §R3 |
| F13 | Automated Defect Resolution | Fix all identified defects directly in src/ and ensure zero regressions across existing test invariants | M4 | ORIGINAL_REQUEST §R4 |
| F14 | Comprehensive E2E Testing Suite | Multi-tier test suite (Tiers 1-4) verifying all user requirements and system behavior | E2E Track | ORIGINAL_REQUEST §Criteria |
| F15 | Adversarial Coverage Hardening | White-box stress testing and gap discovery (Tier 5) ensuring high robustness and resilience | Final Milestone | Project Pattern |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| E2E | E2E Testing Track | Requirement-driven Opaque-Box Test Harness & Tiers 1-4 Suites (TEST_READY.md) | none | IN_PROGRESS |
| M1 | Lifecycle Simulation (R1) | Multi-day daily simulation from Day 1 to 100% across all 8 combinations & pacing presets | none | IN_PROGRESS |
| M2 | Edge-Case & Disruption Stress (R2) | 1-14 missed days, Adjust Plan, past deadline guard, calendar boundaries, mid-plan switches | M1 | PLANNED |
| M3 | UI State Sync & Storage Integrity (R3) | Day counter sync, +1 syllabus view, v6 version harmonization, 100% celebration & confetti | none | IN_PROGRESS |
| M4 | Invariant Hardening & Defect Fixes (R4) | Implement code fixes in src/, maintain compatibility with 15 Vitest suites & 553 legacy checks | M2, M3 | PLANNED |
| M5 | Final Milestone & Adversarial Hardening | Phase 1: 100% E2E tests pass (Tiers 1-4); Phase 2: Tier 5 Adversarial Coverage Hardening | M1, M2, M3, M4, E2E | PLANNED |

## Interface Contracts
### Scheduler & Planner Core ↔ UI Controller
- `buildIntelligentPlan(options)`:
  - Input: `{ stream, deadlineDateStr, startDateStr, dailyHours, restDay, targetTerm, completedChapterIds, completedTaskIds, ... }`
  - Output: `{ planDays, warnings, stats, syllabusRunwayDays, revisionBufferDays, isInfeasible }`
  - Error Contract: Throws validation error if dates invalid; must be guarded when `startDateStr >= deadlineDateStr`.
- `getRemainingPlanTasks(options)`:
  - Input: `{ grade, stream, targetTerm, completedChapterIds, completedTaskIds }`
  - Output: Array of uncompleted canonical atomic tasks.
- `persistStudyBackup(state, storage)`:
  - Atomic write to `plusTwoMissionState_v2` and `plusTwoPlanState`.
  - On error: Rollback to previous values.

## Code Layout
- `src/core/scheduler.js`: Framework-agnostic mathematical scheduler and constraint propagation.
- `src/engine/planner.js`: Legacy-compatible scheduler interface and options normalizer.
- `src/engine/migration.js`: State schema migrations across versions.
- `src/app.js`: Application UI lifecycle, event wiring, and view rendering.
- `src/ui/daily-plan.js`: Daily view calculation and overdue tasks partition.
- `src/utils/confetti.js`: Zero-dependency HTML5 canvas confetti particle generator.
- `src/utils/study-backup.js`: Storage persistence, validation, and JSON serialization.
- `src/data/syllabus-plus-one.js`: Canonical Class 11 Kerala SCERT curriculum data.
- `src/data/syllabus-plus-two.js`: Canonical Class 12 Kerala SCERT curriculum data.
- `tests/`: Vitest test suites.
