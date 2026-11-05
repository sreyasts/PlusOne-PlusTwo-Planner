# E2E Test Infra: HSS Study Planner Mobile & Cross-Device Optimization

## 1. Test Philosophy
- **Opaque-Box & Requirement-Driven**: Tests derive directly from authoritative user requirements in `ORIGINAL_REQUEST.md` and architecture contracts in `PROJECT.md`.
- **4-Tier Verification Methodology**:
  - **Tier 1 (Feature Coverage)**: Comprehensive happy-path equivalence class testing (minimum 5 distinct assertions/tests per feature).
  - **Tier 2 (Boundary & Corner Cases)**: Edge conditions, empty states, missing APIs, format conversions, long strings, and safe-area inset fallbacks.
  - **Tier 3 (Cross-Feature Combinations)**: Pairwise interactions (Theme toggle × Action sheet, Language switch × Action sheet labels, Calendar export × CSV export, Plan filter × Export).
  - **Tier 4 (Real-World Application Scenarios)**: Multi-step end-to-end user workflows on mobile devices (navigation, sheet interaction, downloads, clipboard copy, return navigation).
- **DOM & Runtime Isolation**: Self-contained in-memory DOM simulation (`createMockElement`, isolated event registries, in-memory localStorage) running under Vitest Node environment without browser binary dependencies.
- **Production Code Integrity Standard**:
  - Genuine execution of production functions (`openExportShareSheet`, `closeExportShareSheet`, `exportTimetableCsv`, `exportTimetableIcs`, `shareApp`, `copyShareLink`, `getShareSummaryText`) extracted directly from `src/app.js` into sandboxed VM execution contexts.
  - Genuine structural assertions against production markup in `index.html`, `src/app.js`, and `src/style.css`.
  - Zero facade tests, zero private mock duplicates, zero unfalsifiable (`|| true`) assertions.

---

## 2. Feature Inventory & Test Coverage Matrix

| # | Feature | Source | Tier 1 (Coverage) | Tier 2 (Boundary) | Tier 3 (Cross-Feature) | Tier 4 (Scenario) | Target Test Count |
|---|---------|--------|:-----------------:|:-----------------:|:----------------------:|:-----------------:|:-----------------:|
| 1 | Mobile Bottom Action Sheet | ORIGINAL_REQUEST §R1 | 7 | 4 | 2 | 2 | ≥ 15 |
| 2 | Responsive Header Action Toolbar | ORIGINAL_REQUEST §R1 | 6 | 3 | 2 | 2 | ≥ 13 |
| 3 | Export Execution Parity | ORIGINAL_REQUEST §R1 | 5 | 3 | 2 | 2 | ≥ 12 |
| 4 | Bilingual Labeling Support | Explorer 1 & 2 Survey | 5 | 2 | 2 | 2 | ≥ 11 |
| 5 | Cross-View Responsive Layout | ORIGINAL_REQUEST §R2 | 5 | 3 | 2 | 2 | ≥ 12 |
| 6 | Touch Target Elevation (≥44x44px) | ORIGINAL_REQUEST §R2 | 6 | 2 | 2 | 2 | ≥ 12 |
| 7 | Mobile Interactivity & Tactile Feedback | ORIGINAL_REQUEST §R3 | 5 | 2 | 1 | 2 | ≥ 10 |
| 8 | E2E Mobile & Responsive Test Suite | ORIGINAL_REQUEST §R4 | 5 | 2 | 2 | 2 | ≥ 11 |
| 9 | Clean Build & Regression Verification | ORIGINAL_REQUEST §R4 | 5 | 2 | 2 | 2 | ≥ 11 |

---

## 3. Test Architecture & Environment

- **Runner**: Vitest v5.0.1 (`environment: 'node'`).
- **Target Suite**: `tests/mobile-responsive-actions.test.js`.
- **DOM & Production Execution Strategy**:
  - In-memory mock element tree (`createMockElement`) implementing `classList` (`add`, `remove`, `contains`, `toggle`), `dataset`, `style`, `setAttribute`, `getAttribute`, `closest`, `querySelectorAll`, and `addEventListener`.
  - Node `vm.createContext` execution sandbox loading genuine production functions directly from `src/app.js` (`extractAppFunction`) bound to isolated DOM, Blob, URL, and Navigator shims.
  - Global runtime shims for `window`, `document`, `navigator` (`navigator.share`, `navigator.clipboard`), `Blob`, and `URL` (`createObjectURL`, `revokeObjectURL`).
  - Spies and mocks for UI toast (`showAppToast`), analytics (`trackEvent`), and print (`window.print`).
- **Production Artifact Invariant Verifiers**:
  - Verification of Tailwind breakpoint classes in `app.js` (`sm:hidden`, `hidden sm:flex`).
  - Verification of minimum touch boundary classes in `index.html` and `app.js` (`min-h-[44px]`, `min-w-[44px]`, `min-h-[56px]`, `w-11 h-11`).
  - Verification of tactile press transitions in production templates (`active:scale-95`, `active:scale-[0.98]`, `transition`).
  - Verification of safe-area inset protection in `index.html` and `style.css` (`pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]`).

---

## 4. Real-World Application Scenarios (Tier 4)

| # | Scenario | Features Exercised | User Journey Description | Complexity |
|---|----------|--------------------|--------------------------|------------|
| 1 | Mobile Student Full Plan Export & Share Flow | F1, F2, F3, F6, F7 | Student on 375px phone navigates from Today to Full Plan, taps "Share / Export" overflow trigger, opens bottom action sheet, exports CSV spreadsheet, confirms sheet auto-dismiss and scroll restoration, and returns to Today. | High |
| 2 | Offline Student Exporting Complex Schedule with Special Characters & Malayalam | F3, F4, F8 | Student offline with customized plan containing commas, quotes, and Malayalam subject/chapter strings executes CSV export. Verifies RFC 4180 escaping, UTF-8 Blob encoding, and toast feedback. | High |
| 3 | Student Sharing Study Streak on WhatsApp via Web Share Fallback | F1, F3, F5, F7 | Student with active 7-day streak taps Share in action sheet on a device without Web Share API. System formats rich summary text (progress %, streak) and opens prefilled WhatsApp sharing link. | Medium |
| 4 | Cross-Device Viewport Breakpoint & Parity Transition | F1, F2, F3, F5 | Verifies responsive toolbar toggle at 640px threshold. Below 640px, overflow trigger is active and inline controls hidden; at/above 640px, inline controls are active. Both paths execute identical export functions. | Medium |
| 5 | Touch Target & Tactile Interaction Walkthrough Across Views | F5, F6, F7 | Exercises interactive touch targets across Full Plan, Today board, Setup wizard, and modals, verifying minimum 44px hit bounds, active press states, and zero sticky hover. | High |

---

## 5. Coverage & Quality Gates

1. **Pass Rate**: 100% of tests in `tests/mobile-responsive-actions.test.js` pass with zero failures.
2. **Regression Zero-Tolerance**: All 31 pre-existing Vitest test files pass without regression (525 total tests).
3. **Legacy Invariant Engine**: All 553 checks in `npm run test:legacy` pass with zero failures.
4. **Clean Production Build**: `npm run build` completes with zero bundling errors and all static assets verified in `dist/`.
5. **Clean Lint**: `npm run lint` passes with 0 errors and 0 warnings.
