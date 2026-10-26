# Owner Inputs & Operational Authority Log

This document records decisions, authorizations, and persistent owner inputs so the autonomous maintainer never redundantly asks questions already answered.

---

## 1. Discovered Identity & Authorities

| Parameter | Value | Source / Discovery |
| :--- | :--- | :--- |
| **Owner Name** | Sreyas T S | Git config / GitHub API |
| **Public Contact Email** | `sreyasts52@gmail.com` | Git author identity / Firebase login |
| **GitHub Handle** | `sreyasts` | Authenticated via `gh` CLI |
| **Production Domain** | `https://hss-planner.web.app/` | Firebase project `mission-plustwo` |
| **Secondary Mirror** | `https://mission-plus2.web.app/` | Firebase Hosting site |
| **Legacy Mirror** | `https://sreyasts.github.io/PlusOne-PlusTwo-Planner/` | Canonical auto-redirect active |
| **License** | MIT License | `LICENSE` file |

---

## 2. External Services Status

| Service | Status | Action Required From Owner |
| :--- | :--- | :--- |
| **Google Search Console** | Verification HTML present (`google03905a8a03a50ab1.html`), property active | Direct API service account credentials optional for automated pull |
| **Firebase Hosting** | Logged in as `sreyasts52@gmail.com`, full deployment access | None (Autonomous deploy enabled) |
| **GitHub CLI (`gh`)** | Authenticated as `sreyasts` with repo admin permissions | None (Autonomous repo management enabled) |

---

## 3. Persistent Decisions Log

*Entries added dynamically when owner input is provided.*

- **2026-09-23**: Integrity Invariant confirmed — zero fake traffic, zero fake stars, zero fake testimonials. All benchmarks and reports strictly grounded in real metrics.
- **2026-09-23**: Primary canonical host remains `https://hss-planner.web.app/`.
- **2026-09-24**: Product Identity & Target Audience — Do NOT promote CBSE. +1 & +2 Planner's primary product identity, branding, onboarding streams, and distribution channels remain strictly focused on Kerala DHSE Higher Secondary (+2 Science, Commerce, Humanities, and +1 Improvement). Any secondary curriculum adapters remain strictly architectural/developer-facing, never promoted in the student UI or user-facing product pages.
- **2026-09-24**: Pragmatic Roadmap Discipline — No speculative or hyped roadmap items (e.g., Malayalam Voice Assistant, WebRTC collaborative peer study sprints, teacher batch export). Maintain a strictly grounded, honest, and realistic roadmap reflecting only features the maintainer actually plans to build and support (deterministic planning, model exam simulations, spaced recall flashcards, accessibility, DHSE syllabus updates).
- **2026-09-24**: Single Unified Logo & Search Optimization — Strict requirement to use one single canonical logo (`icon.png`) across all application headers, PWA icons, favicons, GitHub README, Google Search schema/OpenGraph, and social previews. Comprehensive keyword coverage for high-intent search terms ('plus two', '12th', 'plustwo plan', 'plustwo planner', 'plustwo timetable', 'kerala plus two timetable') with authentic UI screenshots and promotional assets.
- **2026-09-24**: Minor Data Consent Architecture (DPDP Act 2023) — Option A selected: Default to 100% Guest Mode (offline `localStorage`, zero PII); enforce explicit affirmative parental/guardian consent confirmation gate (`#auth-consent-checkbox`) for minors under 18 prior to Google OAuth cloud synchronization.
- **2026-09-24**: Telemetry & Cookie Policy — Option A selected: Full cookie and pseudonymous identifier transparency in Privacy Policy with lazy loading, strict PII masking (`allow_google_signals: false`, `allow_ad_personalization_signals: false`), and in-app privacy documentation.
- **2026-09-24**: Strategic Plan Execution Approved — Prioritize accurate documentation, real usage measurement, distribution resources and maintainer infrastructure.
