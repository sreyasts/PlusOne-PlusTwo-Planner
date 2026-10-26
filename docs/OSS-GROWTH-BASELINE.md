# HSS Planner — OSS Growth Forensic Baseline Audit

This document records the exact baseline state of **HSS Planner** (`sreyasts/hss-planner`) as of **September 23, 2026**.

In accordance with our strict anti-fabrication policy, every metric recorded here is derived from authoritative, auditable primary data sources (GitHub REST/GraphQL APIs, Git commit trees, local test harnesses, and live production endpoints).

---

## 1. Baseline Metric Ledger

| Metric | Baseline Value | Data Source | Date Measured |
| :--- | :--- | :--- | :--- |
| **GitHub Stars** | `5` | GitHub API (`stargazerCount`) | 2026-09-23 |
| **GitHub Forks** | `1` | GitHub API (`forkCount`) | 2026-09-23 |
| **GitHub Watchers** | `1` | GitHub API (`watchers.totalCount`) | 2026-09-23 |
| **Open Issues** | `0` | GitHub API (`repos/sreyasts/.../issues?state=open`) | 2026-09-23 |
| **Closed Issues** | `0` | GitHub API (`repos/sreyasts/.../issues?state=closed`) | 2026-09-23 |
| **Pull Requests (Open)** | `0` | GitHub API (`repos/sreyasts/.../pulls?state=open`) | 2026-09-23 |
| **Pull Requests (Merged/Closed)** | `0` | GitHub API (`repos/sreyasts/.../pulls?state=closed`) | 2026-09-23 |
| **Unique Contributors** | `1` (`sreyasts`) | GitHub API (`contributors`) | 2026-09-23 |
| **Total Contributions** | `57` | GitHub API (`contributors`) | 2026-09-23 |
| **GitHub Releases** | `0` | GitHub API (`releases`) | 2026-09-23 |
| **Git Tags** | `1` (`v5-pre-overhaul`) | Git local & remote tag ref | 2026-09-23 |
| **Repository Age** | 4 days (Created 2026-09-19T03:42:25Z) | GitHub API (`createdAt`) | 2026-09-23 |
| **Total Commits on `main`** | `57` | Git (`git rev-list --count HEAD`) | 2026-09-23 |
| **Commit Activity Span** | 2026-09-19 to 2026-09-23 | Git commit history | 2026-09-23 |
| **Live Web App (Primary)** | [https://hss-planner.web.app/](https://hss-planner.web.app/) | Firebase Hosting (SSL Active, HTTP 200) | 2026-09-23 |
| **Live Web App (Canonical Forwarder)** | [https://sreyasts.github.io/hss-planner/](https://sreyasts.github.io/hss-planner/) | GitHub Pages (Workflow deployment, HTTP 200) | 2026-09-23 |
| **GitHub Traffic (Past 14 Days)** | 162 views, 21 unique visitors | GitHub API (`traffic/views`) | 2026-09-23 |
| **Vitest Unit Test Suite** | 3 test files, 25 tests passing | Local test run (`npm test`) | 2026-09-23 |
| **Invariant Engine Test Runner** | 402 checks passing (0 failures) | Local test run (`npm run test:legacy`) | 2026-09-23 |
| **ESLint Static Analysis** | 0 errors, 20 unused variable warnings | Local linter run (`npm run lint`) | 2026-09-23 |
| **Production Bundle Size** | 73.17 kB HTML, 237.08 kB JS (gzip: ~59 kB), 95.19 kB CSS | Production build (`npm run build`) | 2026-09-23 |
| **CI / CD Pipeline Status** | Passing (`CI & Build Verification`, `Deploy HSS Planner`) | GitHub Actions Runs | 2026-09-23 |
| **Firebase Analytics ID** | `G-12KPP3ZZ80` (Cookieless, DPDP-compliant) | `src/analytics/tracker.js` | 2026-09-23 |

---

## 2. Qualitative Technical Audit

### Architecture & Engine
* **Modernized ESM Pipeline**: Migrated from monolithic single-file HTML to modular Vite + Tailwind CSS bundle with dedicated modules for planning, audio, i18n, analytics, and auth.
* **Dual-Stream Support**: Full coverage for Computer Science stream (Physics, Chemistry, Maths, CS) and Biology Science stream (Physics, Chemistry, Maths, Biology).
* **Cross-Domain Bridge**: Built-in canonical forwarder from `github.io` to `web.app` preserving student session state across domain hops.
* **Offline-First PWA**: WebAPK-compliant with dedicated maskable icons, Network-First Service Worker, and Google Account cloud synchronization.

### Current Technical Debt
1. **Linter Hygiene**: 20 unused variable warnings across `src/app.js` and `src/engine/planner.js` require cleanup.
2. **Missing Algorithm Documentation**: Absence of formal mathematical formulation of the interleaving and buffering constraints.
3. **No Reproducible Benchmark Suite**: Absence of automated benchmarking comparing the planner against naive sequential and round-robin implementations.
4. **Issue & PR Governance**: Lack of standardized issue templates for Malayalam localization, accessibility, and performance reports.
5. **Release Infrastructure**: Lack of semantic versioned GitHub Releases and a formal `CHANGELOG.md`.
6. **Documentation Path Drift**: Hardcoded dev path reference in root `README.md` (`d:\GitHub\...`).

---

## 3. User Acquisition Baseline

Currently observed acquisition channels:
1. **Organic GitHub**: 21 unique visitors / 162 pageviews over initial 4 days.
2. **Direct Peer Sharing**: Community outreach scripts defined in `docs/distribution-growth-kit.md` targeting Kerala student WhatsApp groups and Telegram study channels.
3. **Search Engine Indexing**: Initial sitemap (`sitemap.xml`) and Google Search Console verification tag deployed.

This baseline represents Day 0 of the structured OSS growth process.
