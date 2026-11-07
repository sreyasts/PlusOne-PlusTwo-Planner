# Project: Schedule Rebalancing Reliability, Auto-Detect & Rebalance Workflow, and Comprehensive Curriculum Audit

## Architecture
- **Tech Stack**: Vanilla JavaScript (ESM Single Page Application), Vite 8.3.0, Tailwind CSS v4.3.3.
- **Planner & Scheduler Core**:
  - `src/engine/planner.js`: Deterministic curriculum scheduler, subject alternation, milestone buffer spacing, study intensity scaling, active recall revision cycles, `buildIntelligentPlan()`. Disambiguated chapter grouping via `chapId`.
  - `src/core/scheduler.js`: Core schedule generation engine, multi-stream support (`bio`, `cs`, `commerce`, `humanities`, `imp_only`), day allocation, timetable construction. Automatic stream inference for Commerce & Humanities, chapter matching by `chapId`.
  - `src/utils/plan-scope.js`: Task filtering (`getRemainingPlanTasks`), stream subject mapping (`getStreamSubjects`), completion detection (`detectCompletedSyllabusProgress`).
- **State & Persistence**:
  - `appState.plan`: Array of day objects with `dayNumber`, `date`, `tasks` (each task has `id`, `chapId`, `part`, `totalParts`, `completed`, `estimatedMinutes`).
  - `appState.completedChaptersOnInit`: Array of completed chapter IDs.
  - `appState.improvementConfig`: Configuration for +1 improvement exam subjects and dates.
- **UI & Modal Layer**:
  - `index.html`: Shell markup, `#regenerate-modal` with auto-detect triggers (`#btn-auto-rebalance`), summary badge (`#auto-detect-summary-badge`), day dropdown, action buttons.
  - `src/app.js`: Application lifecycle, modal controllers (`openRegenerateModal`, `executeRegeneration`, `autoDetectAndRebalance`), task toggling, and view rendering.
  - `src/i18n/ml.js`: Full bilingual localization (English & Malayalam) for auto-detect options and badges.
  - `src/style.css`: High-contrast dark and light mode stylesheet definitions.
- **Syllabus & Curriculum Datasets**:
  - `src/data/syllabus-plus-one.js` & `src/data/syllabus-plus-two.js`: Canonical runtime syllabus definitions (289 chapters across 13 subjects). Strictly validated against `src/data/syllabus-schema.json`.
  - `src/data/all-syllabus-summary.json`: Machine-readable summary for static pages and verification.
  - `data/kerala-dhse/{science,commerce,humanities}.json`: Public curriculum datasets conforming 100% to `schemas/curriculum.schema.json`. Pruned contaminated subjects, updated Python CS +1 (13 ch) and CA +1 (8 ch), restored History +2 Ch 12 and Pol Sci +2 (15 ch).
  - `src/data/syllabus-schema.json`: Strict schema for individual SCERT syllabus chapters.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Rebalance Task Preservation | Ensure tasks completed out-of-order or ahead of schedule are preserved and never dropped during rebalancing | M1 | ORIGINAL_REQUEST §R1 |
| 2 | Rebalance Reset Preservation | Ensure completed tasks remain preserved as distinct markers when resetting schedule (Day 0) | M1 | ORIGINAL_REQUEST §R1 |
| 3 | Scheduler Stream Inference | Infer `commerce` and `humanities` streams in `src/core/scheduler.js` when `stream` parameter is omitted | M1 | ORIGINAL_REQUEST §R1 |
| 4 | Improvement Config Preservation | Retain `appState.improvementConfig` during rebalancing instead of passing empty array `[]` | M1 | ORIGINAL_REQUEST §R1 |
| 5 | Multi-Part Chapter Integrity | Maintain proper prerequisite chaining, ordering, and preservation of multi-part chapters across rebalance | M1 | ORIGINAL_REQUEST §R1 |
| 6 | Completed Progress Scanner | `detectCompletedSyllabusProgress(appState)` helper to scan checkmarks, completed parts, and anchor days | M2 | ORIGINAL_REQUEST §R2 |
| 7 | Completed Day Marker Arrangement | Arrange completed tasks into distinct historical completed markers (Days 1..K) in the schedule | M2 | ORIGINAL_REQUEST §R2 |
| 8 | Auto-Detect Rebalance Execution | `autoDetectAndRebalance()` controller recalculating remaining syllabus starting from marked day forward | M2 | ORIGINAL_REQUEST §R2 |
| 9 | Adjust & Rebalance Modal UI | Add Auto-Detect & Rebalance button, progress summary badge, and bilingual labels to `#regenerate-modal` | M2 | ORIGINAL_REQUEST §R2 |
| 10 | `science.json` Pruning | Remove 7 contaminated Commerce & Humanities Class 12 subjects from `data/kerala-dhse/science.json` | M3 | ORIGINAL_REQUEST §R3 |
| 11 | Science CS +1 Python Curriculum | Update Class 11 Computer Science in `science.json` from legacy 10-chapter C++ to official 13-chapter Python | M3 | ORIGINAL_REQUEST §R3 |
| 12 | Commerce CA +1 Python Curriculum | Update Class 11 Computer Applications in `commerce.json` from legacy 10-chapter C++ to official 8-chapter Python | M3 | ORIGINAL_REQUEST §R3 |
| 13 | Humanities History & Pol Sci +2 Restoration | Restore History +2 Ch 12 ("Framing the Constitution") and expand Pol Sci +2 to 15 chapters in `humanities.json` | M3 | ORIGINAL_REQUEST §R3 |
| 14 | Syllabus Schema Compliance | Verify all syllabus datasets against `src/data/syllabus-schema.json` and `schemas/curriculum.schema.json` | M3 | ORIGINAL_REQUEST §R3 |
| 15 | E2E Testing Suite (Tiers 1-4) | Comprehensive requirement-driven opaque-box test suite for rebalancing, auto-detect, and curriculum integrity | E2E | ORIGINAL_REQUEST §R4 |
| 16 | Final E2E Pass & Coverage Hardening | 100% pass of E2E suite, Vitest test suite, legacy engine checks, production build, and Tier 5 adversarial audit | M4 (Final) | ORIGINAL_REQUEST §R4 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| E2E | E2E Testing Track | Design E2E test infra (`TEST_INFRA.md`), create requirement-driven tests covering Tiers 1-4, publish `TEST_READY.md` | Survey | DONE |
| 1 | Rebalancing Reliability & Part Preservation | Fix task loss, stream inference, improvement preservation, and multi-part chapter sequencing in rebalancing engine | Survey | DONE |
| 2 | Auto-Detect & Rebalance Modal Workflow | Implement `detectCompletedSyllabusProgress`, `autoDetectAndRebalance`, marker arrangement, and modal UI | M1 | DONE |
| 3 | Comprehensive Syllabus Audit & Updates | Audit and update syllabus datasets across Science, Commerce, and Humanities streams to match SCERT/NCERT | Survey | DONE |
| 4 | Final Milestone: E2E Test Pass & Hardening | Phase 1: Pass 100% E2E test suite, all Vitest tests, engine checks, build. Phase 2: Adversarial coverage hardening (Tier 5) | E2E, M1, M2, M3 | DONE |

## Interface Contracts
### Scheduler & Plan Scope Engine ↔ Application
- `detectCompletedSyllabusProgress(appState)`: Returns `{ completedTaskIds: Set<string>, completedChapterIds: Set<string>, completedTasks: Array<Task>, completedDayMarkers: Array<DayPlan>, anchorDayNumber: number, totalCompletedTasks: number }`.
- `getRemainingPlanTasks({ grade, stream, targetTerm, completedChapterIds, completedTaskIds })`: Returns array of uncompleted canonical tasks without omitting any pending chapter parts.
- `autoDetectAndRebalance()`: High-level handler called from `#regenerate-modal`. Scans completion status, constructs completed markers (Days 1..K), calculates remaining plan starting today (Days K+1..N), updates `appState.plan`, saves snapshot, updates UI.
- `buildIntelligentPlan(deadlineDate, tasks, startDate, improvementConfig, stream, options)`: Generates balanced schedule preserving all chapter parts, correct stream subjects, and improvement exam allocations.

### Curriculum Data Contracts
- Every chapter object in `src/data/syllabus-plus-*.js` strictly validates against `src/data/syllabus-schema.json`.
- Stream curriculum datasets in `data/kerala-dhse/*.json` strictly validate against `schemas/curriculum.schema.json`.

## Code Layout
- `src/app.js`: Modal event wiring, `openRegenerateModal()`, `executeRegeneration()`, `autoDetectAndRebalance()`, snapshot handling.
- `src/utils/plan-scope.js`: `getRemainingPlanTasks()`, `getStreamSubjects()`, and `detectCompletedSyllabusProgress()`.
- `src/core/scheduler.js`: `generateSchedule()`, stream detection and task filtering.
- `src/engine/planner.js`: `buildIntelligentPlan()`, multi-part sequencing and chapter grouping.
- `index.html`: `#regenerate-modal` dialog layout, Auto-Detect button, completed progress status badge.
- `src/i18n/ml.js`: Bilingual Malayalam translations.
- `src/style.css`: Modal styling and dark mode rules.
- `data/kerala-dhse/science.json`: Science stream curriculum dataset.
- `data/kerala-dhse/commerce.json`: Commerce stream curriculum dataset.
- `data/kerala-dhse/humanities.json`: Humanities stream curriculum dataset.
- `src/data/syllabus-plus-one.js` & `src/data/syllabus-plus-two.js`: Runtime syllabus source of truth.
- `tests/rebalancing-autodetect-syllabus.test.js`: Comprehensive E2E test suite for R1–R4 (54 tests).
- `tests/rebalance-reliability.test.js`: Dedicated unit test suite for R1-R2 invariants (10 tests).
- `tests/adversarial-rebalance-stress.test.js`: Adversarial stress suite covering 73 edge cases.
- `tests/curriculum-schema.test.js`: Automated schema validation suite for DHSE stream JSON files.
