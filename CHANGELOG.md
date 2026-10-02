# Changelog

All notable changes to **Mission PlusTwo** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [6.4.0] - 2026-10-02

### Added
- **Socratic AI Study Companion & Pedagogical Prompt Adapter (`src/utils/ai_tutor.js`)**:
  - Open-source curriculum-grounded Socratic tutor prompt generator tailored for OpenAI ChatGPT and Google Gemini.
  - Multi-phase structured interactive revision flow:
    1. Direct diagnostic question probing key formulas and mechanisms (e.g. Optics, Organic Reactions, Calculus).
    2. Student pause checkpoint awaiting self-formulated answers before solutions are revealed.
    3. Rigorous 5-point DHSE rubric feedback and common misconception analysis.
    4. Board exam Past-Year Question (PYQ) challenge calibrated to SCERT marking schemes.
  - Deep-link integration allowing one-click launch into OpenAI ChatGPT (`https://chatgpt.com/?q=...`) and clipboard export.
  - Comprehensive bilingual prompt localization in English and Malayalam (`ml`).
- **RFC 5545 iCalendar Exporter (`src/utils/calendar.js`)**:
  - Generates cross-platform standard `.ics` calendar files containing daily scheduled revision sessions.
  - Features automated 15-minute advance notifications (`VALARM`) to keep students disciplined.
  - Deep links directly back to the active chapter task within Mission PlusTwo.
  - Seamless import into Google Calendar, Apple Calendar, and Microsoft Outlook.
- **Desktop Focus Experience & PiP Refinement**:
  - Compacted desktop Picture-in-Picture controls with streamlined Play/Pause and Done dopamine feedback loops.
  - Clean separation of desktop PiP from mobile browser capabilities with battery-conscious Screen Wake Lock on Android/iOS.
- **Automated Test Suites**:
  - Added unit test suites for iCalendar generation (`tests/calendar.test.js`) and Socratic AI prompt generator (`tests/ai_tutor.test.js`).
  - Total automated test suite expanded to 95 Vitest tests and 553 engine invariant tests, passing with 0 errors and 0 lint warnings.

---

## [1.2.0] - 2026-09-26

### Added
- **Professional Repository Architecture**:
  - Organized and migrated all loose static web assets (`favicon.ico`, `manifest.json`, `robots.txt`, `sitemap.xml`, `sw.js`, `404.html`, etc.) into `public/`.
  - Stored canonical high-res brand logos and preview graphics in `assets/`.
  - Moved PowerShell automation scripts to `scripts/` (`scripts/deploy.ps1`, `scripts/deploy-all.ps1`).
  - Added `.editorconfig`, `.prettierrc`, `.prettierignore`, and `.gitattributes` for cross-platform repository hygiene.
- **Exam-Eve Quarantine & Spaced Retrieval**:
  - Intelligent exam eve subject locking: on the eve before any subject exam, the plan focuses solely on that upcoming paper to prevent cognitive overload.
  - Mathematical Ebbinghaus Forgetting Curve ($R = e^{-t/S}$) spaced retrieval scheduling.
- **PC-Only Document Picture-in-Picture Floating Window**:
  - Interactive Desktop PiP (`window.documentPictureInPicture`) floating widget with live countdown, Pause/Resume, and Mark Done controls.
  - Native Screen Wake Lock API (`navigator.wakeLock`) on mobile devices.
  - Cleaned ESLint configuration to 0 warnings and 0 errors.

---

## [1.1.0] - 2026-09-24

### Added
- **Decoupled Core Scheduling Engine (`src/core/`)**:
  - Extracted framework-agnostic pure logic module into `src/core/scheduler.js` with deterministic `generateSchedule({ stream, examDate, subjects, hoursPerDay, focusAreas })` API.
  - Added discrete active recall allocation (`allocateActiveRecall`) and invariant schedule validator (`validateSchedule`).
  - Implemented 100% backward compatibility bridge in `src/engine/planner.js` ensuring existing web UI and legacy tests pass unconditionally.
- **Machine-Readable Open Curriculum Schemas (`schemas/` and `data/kerala-dhse/`)**:
  - `schemas/curriculum.schema.json`: Rigid Draft-07 JSON Schema strictly validating `subjectId`, `subjectName`, `stream`, and `chapters` (with `chapterNumber`, `title`, `weightageScore`, and `recommendedRevisionHours`).
  - `data/kerala-dhse/science.json`: Formalized DHSE Science stream curriculum (Physics, Chemistry, Mathematics, Botany, Zoology, Computer Science).
  - `data/kerala-dhse/commerce.json`: Formalized DHSE Commerce stream curriculum (Accountancy, Business Studies, Economics, Computer Applications).
  - `data/kerala-dhse/humanities.json`: Formalized DHSE Humanities stream curriculum (History, Political Science, Sociology, Economics).
- **Automated Verification & CI Upgrades**:
  - `tests/scheduler.test.js`: Comprehensive test suite testing short revision runways (7 days), standard multi-month schedules (120 days), single-subject intensive courses, and malformed inputs/boundary conditions.
  - `tests/curriculum-schema.test.js`: Automated Ajv schema test verifying all curriculum JSON files against `curriculum.schema.json`.
  - Upgraded `.github/workflows/ci.yml` with ESLint, Vitest, schema validation, legacy invariant tests, and Vite production bundle checks.
- **Community & Governance Infrastructure**:
  - Standard Contributor Covenant v2.1 in `CODE_OF_CONDUCT.md`.
  - Comprehensive `CONTRIBUTING.md` with Conventional Commits and branch workflow specifications.
  - `SECURITY.md` covering responsible disclosure, SLA, and DPDP Act 2023 minor data protection.
  - Structured issue templates (`bug_report.md`, `syllabus_update.md`, `feature_request.md`) and `.github/PULL_REQUEST_TEMPLATE.md`.

---

## [1.0.0] - 2026-09-21

### Added
- Initial open-source release of the core study timetable scheduling algorithm for Kerala DHSE Class 12 candidates.
- Spaced repetition interleaving across Physics, Chemistry, Mathematics, and Computer Science / Biology.
- Basic test harness and invariant validation checks.

---

## [6.3.0] - 2026-09-24

### Added
- **Curriculum Adapter Framework (`src/adapters/`)**:
  - `CurriculumAdapter`: Base class providing task schema validation (`CurriculumAdapter.validateTask`), subject grouping, chapter-part hierarchy, and planning options conversion.
  - `KeralaDHSEAdapter`: Wraps canonical SCERT Plus Two and Plus One syllabi for Science, Commerce, and Humanities streams.
  - `CBSEClass12Adapter`: Rationalized NCERT curriculum for CBSE Class 12 Senior School Certificate Examination (Physics, Chemistry, Mathematics, Biology, Computer Science, English Core).
  - Multi-board planning support in `buildIntelligentPlan` via `opts.adapter` or direct custom `opts.tasks` array.
- **Interactive Standalone Growth Tools**:
  - `/pages/exam-countdown.html`: Live countdown timer to Kerala DHSE board, model, and practical exams with real-time daily study load and workload feasibility analysis.
  - `/pages/backlog-recovery-planner.html`: Evidence-based 70/30 interleaved catch-up schedule generator for Class 12 students clearing pending chapters.
  - Schema.org `WebApplication` and `FAQPage` structured data added to both new tools.
  - Clean URL rewrites configured in `firebase.json` and updated in `sitemap.xml`.
- **Product-Led Viral Growth & Offline Sharing**:
  - Implemented offline vector QR code generator in `src/utils/qr.js` using client-side SVG rendering (zero external network requests).
  - Integrated printable QR code watermark card in Full Plan view and `@media print` stylesheet for desk-wall study timetables and peer scanning.
- **Test Suite Expansion**:
  - Added `tests/curriculum_adapter.test.js` (10 tests) verifying multi-board adapters, schema adherence, and end-to-end CBSE study plan generation.
  - Added `tests/qr.test.js` (2 tests) verifying client-side vector SVG generation and resilient edge-case handling.
  - Expanded automated unit test suite to 53 passing Vitest tests (in addition to 551 passing legacy invariant checks).

### Changed
- Resolved GitHub Issue #3: Added practical lab exam revision guidance and Schema.org FAQPage entry to `/pages/plus-two-timetable.html`.
- Updated `docs/ARCHITECTURE.md` Section 6 to document the concrete `src/adapters/` package and usage patterns.
- Updated `docs/CODEX-OSS-EVIDENCE.md` with latest test counts, release tag, and architectural deliverables.

---

## [6.2.0] - 2026-09-24

### Added
- **Product-Led Growth & Sharing Engine**:
  - Integrated Web Share API with instant WhatsApp and Telegram share fallbacks (`src/app.js`).
  - Added 1-click clipboard link copying (`copyShareLink()`) with visual toast confirmation.
  - Added CSV timetable export (`exportTimetableCsv()`) generating clean downloadable spreadsheets (`mission-plustwo-schedule.csv`).
  - Added dedicated `@media print` stylesheet in `src/style.css` for high-contrast, black-and-white physical wall printing and PDF saving.
- **Search Engine Acquisition Pages**:
  - `/pages/plus-two-timetable.html`: High-intent Kerala Plus Two Timetable & Revision Countdown landing page with Schema.org FAQPage structured data.
  - `/pages/study-hours-calculator.html`: Interactive client-side study hours and runway calculator computing required school day vs holiday study hours.
  - Updated `firebase.json` rewrites and `sitemap.xml` with priority `0.9` indexing.
- **Open Source Contributor Infrastructure**:
  - Added [Code of Conduct](CODE_OF_CONDUCT.md) based on Contributor Covenant 2.1.
  - Added GitHub Issue Templates for [Feature Requests](.github/ISSUE_TEMPLATE/feature_request.md) and [Malayalam Translations](.github/ISSUE_TEMPLATE/translation_correction.md).
  - Upgraded [Pull Request Template](.github/pull_request_template.md) with automated testing, mobile viewport, and privacy verification checklist.
  - Expanded [Contributing Guide](CONTRIBUTING.md) with local dev workflow, directory map, and good first issue guidelines.
  - Added [Malayalam Translation Guide](docs/TRANSLATION-GUIDE.md) and [Accessibility Standards Guide](docs/ACCESSIBILITY-GUIDE.md).
- **Forensic & Analytics Documentation**:
  - `docs/OSS-ADOPTION-BASELINE.md`: 100% measured baseline of GitHub, Product, SEO, and OSS metrics.
  - `docs/ANALYTICS.md`: Privacy-first DPDP Act & GDPR compliant analytics architecture.
  - `docs/IMPACT.md`: Public-safe community impact dashboard.
  - `docs/GROWTH-EXPERIMENTS.md`: Structured growth hypotheses and results tracking.
  - `docs/monthly/2026-09.md`: Monthly maintainer report for September 2026.
  - `docs/CODEX-OSS-EVIDENCE.md`: Verified evidence portfolio for OpenAI Codex for Open Source.

### Changed
- Standardized canonical analytics events in `src/analytics/tracker.js` (`landing_view`, `onboarding_started`, `plan_generated`, `plan_shared`, `plan_exported`, `return_visit`).
- Updated package author to `Sreyas T S <sreyasts52@gmail.com>`.

---

## [6.1.0] - 2026-09-23

### Added
- **Formal Algorithm Specification**: Authored [`docs/ALGORITHM.md`](docs/ALGORITHM.md) detailing continuous accumulator pacing, multi-subject interleaving, and topological constraint satisfaction.
- **Empirical Benchmark Suite**: Created [`scripts/benchmark-planner.js`](scripts/benchmark-planner.js) and [`docs/BENCHMARKS.md`](docs/BENCHMARKS.md) comparing Mission PlusTwo against Naive Sequential and Round-Robin models across 60-day CS, 90-day Bio, and 25-day sprint scenarios.
- **Telemetry & DPDP Act Specification**: Published [`docs/USAGE-METRICS.md`](docs/USAGE-METRICS.md) codifying cookieless, zero-PII retention funnels and legal compliance under India's Digital Personal Data Protection Act 2023.
- **Forensic Growth Baseline**: Documented complete Day 0 verifiable metrics in [`docs/OSS-GROWTH-BASELINE.md`](docs/OSS-GROWTH-BASELINE.md) and adoption ledger in [`docs/IMPACT.md`](docs/IMPACT.md).
- **Expanded Contributor Templates**: Added standardized GitHub issue templates for Feature Requests, Malayalam Translation, Accessibility (a11y), and Performance profiling.
- **Commerce & Humanities Streams**: Added curriculum mappings for Commerce (Accountancy, Business Studies, Economics) and Humanities subjects.

### Fixed
- Fixed scheduler runway underflow guard throwing explicit error on non-positive date bounds (`totalDaysCount <= 1`).
- Implemented task deduplication on input syllabus sets to prevent infinite allocation loops.
- Enforced strict numerical bounds \([1, 5]\) on task weights and chapter difficulty coefficients.
- **Static Analysis Hygiene**: Cleaned 100% of unused imports and variable warnings across `src/engine/planner.js` and `src/app.js` (0 errors, 0 warnings).

---

## [6.0.0] - 2026-09-22

### Added
- **Modular ESM Architecture**: Migrated monolithic architecture to modern Vite bundle with discrete modules for planning, audio, i18n, and analytics.
- **Dual-Stream Support**: Full support for Computer Science stream and Biology Science stream (incorporating Botany & Zoology).
- **Plus One (+1) Improvement Module**: Integrated backlog scheduling engine that guarantees completion of improvement subjects prior to examination dates.
- **Native WebAudio Harmonic Synth**: Replaced 100+ KB Tone.js dependency with an ultra-compact 0.6 KB WebAudio harmonic bell synthesizer.
- **WebAPK & Maskable PWA**: Upgraded manifest and icon assets for full Android WebAPK standalone installation without browser framing.
- **Google Account Cloud Sync**: Optional Firebase Firestore persistence enabling students to sync study progress seamlessly across mobile and laptop devices.
- **Cross-Domain Forwarding**: Implemented canonical domain bridge syncing state between GitHub Pages and Firebase Hosting.

---

## [5.0.0] - 2026-09-19

### Added
- Initial public release of Mission PlusTwo interactive study timetable generator for Kerala DHSE Class 12.
- LocalStorage state persistence and task checkmark tracking.
