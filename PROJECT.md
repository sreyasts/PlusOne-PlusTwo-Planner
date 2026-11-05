# Project: HSS Study Planner Mobile & Cross-Device Optimization

## Architecture
- **Tech Stack**: Vanilla JavaScript (ESM Single Page Application), Vite 8.3.0, Tailwind CSS v4.3.3.
- **State & Persistence**: Dual-key atomic LocalStorage persistence (`plusTwoMissionState_v2` and `plusTwoPlanState`).
- **View Hierarchy**: Single-page container `#app-container` dynamically rendering views:
  - `today`: Daily study board, overdue tasks, tomorrow preview, quick tools.
  - `plan`: Full syllabus plan, subject filters, day cards, header action toolbar.
  - `syllabus`: Official DHSE Scheme of Work, chapter mastery, PYQ links.
  - `setup`: 4-step personalized study plan onboarding wizard.
  - Modals: `#auth-modal`, `#settings-modal`, `#regenerate-modal`, `#ai-tutor-modal`.
- **Navigation**: Desktop header navigation (`#nav-btn-*`) and Mobile fixed bottom navigation (`#mobile-nav`).
- **Shared Interfaces**: Global export handlers (`exportTimetableIcs`, `exportTimetableCsv`, `shareApp`, `copyShareLink`, `printTimetable`) and sheet controllers (`openExportShareSheet`, `closeExportShareSheet`).

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Mobile Bottom Action Sheet | Grouped bottom action sheet (<640px) with 56px rows, distinct colored icons, and descriptive text labels for Calendar, CSV, Share, and Copy Link | M1 | ORIGINAL_REQUEST §R1 |
| 2 | Responsive Header Action Toolbar | Full Plan header toolbar rendering Mobile Action Trigger (<640px) and accessible inline buttons (>=640px) | M1 | ORIGINAL_REQUEST §R1 |
| 3 | Export Execution Parity | Identical invocation of Calendar (.ics RFC 5545), CSV (RFC 4180), and Share (navigator.share / WhatsApp fallback) from mobile sheet and desktop toolbar | M1 | ORIGINAL_REQUEST §R1 |
| 4 | Bilingual Labeling Support | Full English and Malayalam localization for action controls and sheet options | M1 | Explorer 1 & 2 Survey |
| 5 | Cross-View Responsive Layout | Layout optimization on 360px–414px viewports across Full Plan, Today, Syllabus, Setup Wizard, and Modals without clipping or overflow | M2 | ORIGINAL_REQUEST §R2 |
| 6 | Touch Target Elevation (>=44x44px) | All interactive controls, buttons, pills, modal close targets, and task checkboxes (via tap expanders) meet minimum 44x44px tap boundaries | M2 | ORIGINAL_REQUEST §R2 |
| 7 | Mobile Interactivity & Tactile Feedback | Active press scaling (`active:scale-[0.97]`), smooth transitions, safe-area inset protection (`env(safe-area-inset-bottom)`), and sticky hover mitigation | M2 | ORIGINAL_REQUEST §R3 |
| 8 | E2E Mobile & Responsive Test Suite | Dedicated Vitest test suite (`tests/mobile-responsive-actions.test.js`) covering Tiers 1-4 for mobile overflow, execution parity, CSV/Share, touch targets, and layout invariants | E2E Testing Track | ORIGINAL_REQUEST §R4 |
| 9 | Clean Build & Regression Verification | 100% pass on all existing Vitest suites (441+ tests), 553 legacy checks, clean ESLint, and zero-error production build (`npm run build`) | M3 (Final) | ORIGINAL_REQUEST §R4 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| E2E | E2E Testing Track | Design test infrastructure (`TEST_INFRA.md`) and author 4-tier comprehensive test suite (`tests/mobile-responsive-actions.test.js`) deriving from requirements; publish `TEST_READY.md` | Survey | IN_PROGRESS |
| 1 | Mobile Action Controls (R1) | Implement Mobile Bottom Action Sheet (`#export-share-sheet`), update Full Plan header toolbar in `src/app.js` and `index.html`, ensure execution parity and bilingual labels | Survey | IN_PROGRESS |
| 2 | Responsive Layout & Touch Ergonomics (R2, R3) | Implement universal 44px touch targets, safe area insets, tactile active states, sticky hover mitigation in `src/style.css`, and cross-view layout hardening | M1 | PLANNED |
| 3 | Final Milestone: E2E Test Pass & Coverage Hardening (R4) | Phase 1: Pass 100% of E2E test suite from `TEST_READY.md`, all Vitest suites, legacy engine checks, and production build. Phase 2: Adversarial coverage hardening via Challenger | M1, M2, E2E | PLANNED |

## Interface Contracts
### Export & Sheet Action Controller ↔ Application Views
- `window.openExportShareSheet()`: Opens `#export-share-sheet`, transitions opacity and translate-y, locks background scroll, binds Escape key dismiss.
- `window.closeExportShareSheet()`: Reverses transition, hides sheet after 300ms, restores background scroll.
- `window.exportTimetableIcs()`: Generates and downloads RFC 5545 `.ics` file; identical behavior on mobile and desktop.
- `window.exportTimetableCsv()`: Generates and downloads RFC 4180 `.csv` spreadsheet; identical behavior on mobile and desktop.
- `window.shareApp()`: Triggers `navigator.share` on mobile or falls back to WhatsApp share link; identical behavior on mobile and desktop.
- `window.copyShareLink()`: Copies canonical URL to clipboard with confirmation toast.
- `window.printTimetable()`: Triggers `window.print()` for print/PDF export.

## Code Layout
- `src/app.js`: Main SPA controller, view renderers (`renderPlanView`, `renderTodayView`, `renderSyllabusView`, `renderSetupWizard`), export handlers, and sheet controllers.
- `src/style.css`: Foundational Tailwind CSS v4 styles, safe-area variables, `.touch-target-44`, `.task-checkbox::after` expander, active states, and print media rules.
- `index.html`: Shell markup, desktop header navigation, mobile fixed bottom bar (`#mobile-nav`), modal dialogs, and `#export-share-sheet`.
- `src/ui/icons.js` & `src/ui/illustrations.js`: Inline SVG definitions.
- `tests/mobile-responsive-actions.test.js`: Comprehensive automated test suite for R1–R4.
- `tests/engine_test.cjs`: Legacy engine validation test suite.
