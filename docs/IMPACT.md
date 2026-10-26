# +1 & +2 Planner — Public Impact & Community Metrics

**Transparency Commitment**: All metrics reported in this document are strictly measured and traceable. No numbers are projected, modeled, or fabricated.

**Last Updated**: 2026-09-24  
**Reporting Cadence**: Monthly updates with continuous repository tracking.

---

## 1. Open Source Community & Repository Evidence

| Metric | Current Measured Value | Measurement Date | Verification Source | Definition |
| :--- | :--- | :--- | :--- | :--- |
| **GitHub Stars** | 5 | 2026-09-23 | GitHub REST API (`stargazers_count`) | Unique GitHub accounts that have starred the repository. |
| **GitHub Forks** | 1 | 2026-09-23 | GitHub REST API (`forks_count`) | Unique public/private forks created from the repository. |
| **Unique Cloners (14d)** | 163* | 2026-09-23 | GitHub Traffic API (`/traffic/clones`) | Distinct IP addresses executing `git clone`/`fetch`. Includes automated CI/CD runners (`actions/checkout`), bots, and developers. |
| **Total Git Clones (14d)**| 465 | 2026-09-23 | GitHub Traffic API (`/traffic/clones`) | Aggregate repository clone operations over the past 14 days. |
| **Unique Visitors (14d)** | 21 | 2026-09-23 | GitHub Traffic API (`/traffic/views`) | Distinct human viewers of the GitHub repository over the past 14 days. |
| **Repository Views (14d)**| 162 | 2026-09-23 | GitHub Traffic API (`/traffic/views`) | Aggregate page views on the GitHub repository over the past 14 days. |
| **Official Releases** | 3 | 2026-09-24 | GitHub Releases (`v6.1.0`, `v6.2.0`, `v6.3.0`) | Semantically versioned production releases published on GitHub. |
| **Total Git Commits** | 71+ | 2026-09-24 | Git log (`main` branch) | Verified commit history on default branch. |
| **External Contributors** | 0 | 2026-09-24 | GitHub API (`/contributors`) | Non-maintainer contributors merged to `main`. |
| **Issues Resolved** | 1 | 2026-09-24 | GitHub Issues API | Triage count of community-reported bugs, docs, and syllabus items (Issue #3). |

*\*Note*: As defined by GitHub, "unique cloners" tracks distinct client IP addresses over a rolling 14-day window. While the raw API reports 163, a significant fraction is attributable to ephemeral GitHub Actions CI/CD runner IPs during frequent commit pushes and automated security scanners. Real organic human viewer interest is conservatively indicated by the **21 unique visitors** and **162 pageviews**.

---

## 2. Product Adoption & Student Utility

| Metric | Measured Status | Verification Source | Definition |
| :--- | :--- | :--- | :--- |
| **Production Domain** | `https://hss-planner.web.app/` | Firebase Hosting Console | Primary canonical production endpoint. |
| **PWA Capability** | Full Offline Support | `sw.js` + Web App Manifest | Installable on Android, iOS, Windows, macOS, and Linux without app stores. |
| **Syllabus Chapters** | 100% Kerala DHSE Rationalized | `src/data/syllabus-plus-two.js` | Physics (14), Chemistry (10), Maths (13), Biology (16), Computer Science (11), Commerce & Humanities. |
| **Stream Coverage** | Bio, CS, Commerce, Humanities | Application Engine | Includes +1 Improvement exam integration for all major subjects. |
| **Automated Tests** | 53 Passing Unit Tests | Vitest (`tests/*.test.js`) | Continuous integration test suite across 5 test suites. |
| **Invariant Verifications**| 551 / 551 Passing | `tests/engine_test.cjs` | Zero schedule collisions, zero duplicate chapters, zero deadline overruns. |

---

## 3. Real Retention & Privacy-Safe Funnels

*Tracked anonymously via on-device storage audit (`src/analytics/tracker.js`) and Firebase Analytics without PII collection.*

| Funnel Metric | Measurement Definition | Status |
| :--- | :--- | :--- |
| **Onboarding Completion** | `Count(plan_generated) / Count(landing_view)` | Actively tracked via client analytics |
| **First-Task Execution** | `Count(task_completed) / Count(plan_generated)` | Tracked on first revision slot checkoff |
| **Day-3 Return (D3)** | Unique returns recorded between 48h and 144h | Tracked via `mpt_day3_recorded` |
| **Peer Sharing Rate** | `Count(plan_shared) / Count(plan_generated)` | Tracked on WhatsApp, Telegram, or Web Share triggers |
| **Offline Export Rate** | `Count(plan_exported) / Count(plan_generated)` | Tracked on print and CSV exports |

---

## 4. Historical Milestones

- **2026-09-19**: Initial public release of +1 & +2 Planner codebase.
- **2026-09-21**: Offline-first PWA caching and canonical domain unification deployed.
- **2026-09-23**: Released `v6.1.0` introducing deterministic constraint-propagation scheduler, empirical benchmark suite (`docs/BENCHMARKS.md`), and Vitest test suite.
- **2026-09-24**: Released `v6.2.0` introducing sharing engine (Web Share API, WhatsApp/Telegram fallback), CSV export, `@media print` PDF stylesheet, high-intent landing pages, and Contributor Covenant 2.1 infrastructure.
- **2026-09-24**: Released `v6.3.0` introducing Curriculum Adapter architecture (`src/adapters/`), Exam Countdown (`/exam-countdown`) and Backlog Recovery (`/backlog-recovery-planner`) tools, offline vector QR generation (`src/utils/qr.js`), and closing Issue #3.

