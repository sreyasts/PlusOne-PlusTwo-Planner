# +1 & +2 Planner: Overhaul & Growth Log

## Baseline Audit (Version 5.6 - Baseline)

- **Date**: September 21, 2026
- **Baseline Git Tag**: `v5-pre-overhaul`
- **Working Branch**: `feature/v6-full-overhaul`
- **Initial File Sizes**:
  - `index.html`: 317,339 bytes (monolithic HTML, Tailwind Play CDN runtime, 15 alerts, 3 confirms)
  - `icon.png`: 942,903 bytes (~943 KB unoptimized single image)
  - `manifest.json`: 502 bytes (missing PWA `id`, single combined icon entry causing Brave/Chrome shortcut badge)
  - `sw.js`: 2,051 bytes (precaches only 4 local files)
  - External dependencies loaded synchronously via CDN:
    - Tailwind Play CDN (`cdn.tailwindcss.com` ~300 KB runtime)
    - FontAwesome CSS + Webfonts (`all.min.css`)
    - Tone.js (`Tone.js` 349 KB)
    - Google Fonts (`Plus Jakarta Sans`)
    - Canvas-confetti CDN
    - Firebase SDKs (v10 compat: app, auth, firestore ~250 KB)
- **Engine Test Checks**: 402 passing checks in `tests/engine_test.js`.
- **Top Deficiencies Identified**:
  1. No privacy analytics or visitor funnel (guests completely invisible).
  2. Multi-step onboarding form before any study schedule value is delivered.
  3. Generic task titles ("Part 1/2: Core Concepts") lacking exact subtopics, minute estimates, and official links.
  4. Privacy copy ("Only your study progress is saved") contradicts code storing displayName and email; no DPDP Act compliance or privacy policy.
  5. 15 blocking `alert()` calls and 3 `confirm()` calls degrading user experience.
  6. Tone.js is 349 KB for just two chime tones; can be replaced with a 0.5 KB native WebAudio synth.
  7. Manifest missing WebAPK specifications causing Brave browser icon badge on home screen.
  8. SEO limited to a single client-rendered page with stale descriptions.

---

## Workstream Progress Tracker

| Workstream | Status | Details |
| :--- | :---: | :--- |
| **A. Safety Net & Migration** | In Progress | Tagged `v5-pre-overhaul`, branch created, rollback script created, migration tests pending |
| **B. Measurement & Funnel** | Queued | Cloudflare Web Analytics / privacy event tracker & funnel view |
| **C. 1-Tap Onboarding & UX Dialogs** | Queued | Instant plan generation, post-plan personalization, accessible in-app modals |
| **D. Content Depth & PYQs** | Queued | Syllabus data schemas, subtopic titles, minute estimates, verified links |
| **E. Trust & DPDP Privacy** | Queued | Privacy policy, teenager-friendly terms, authorized domains check, copy fix |
| **F. Modular Architecture & Tests** | Queued | Vite setup, compiled Tailwind, inline SVGs, Vitest, Playwright |
| **G. Performance, A11y & PWA Shell** | Queued | WebAudio synth, proper 192/512 maskable icons, PWA install prompt |
| **H. SEO & Static Landers** | Queued | Pre-rendered semantic guides, schema.org JSON-LD, sitemap |
| **I. Repo Hygiene & Docs** | Queued | MIT License, accurate README, CONTRIBUTING, SECURITY |
| **K. Distribution & Growth Engine** | Queued | Share-a-plan card, messaging templates, teacher pitch, datesheet watcher |

---
