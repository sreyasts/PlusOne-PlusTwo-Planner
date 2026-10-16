# OpenAI Codex for Open Source — Verified Evidence Portfolio

> Historical snapshot from September 2026, superseded by [the current scorecard](CODEX-READINESS-SCORECARD.md) and [v6.4.2 validation](VALIDATION-6.4.2.md). Historical counts below are not current application evidence. Repository visitors/clones do not establish independent developers or students; star independence and student usage are unverified.

**Repository**: [`sreyasts/intelligent-study-planner-for-plus-two-`](https://github.com/sreyasts/intelligent-study-planner-for-plus-two-)  
**Production Endpoint**: [https://mission-plustwo.web.app/](https://mission-plustwo.web.app/)  
**Maintainer**: Sreyas T S (`sreyasts52@gmail.com`)  
**License**: MIT License (OSI-Approved Open Source)  
**Last Verified**: 2026-09-24  

---

## 1. Project Mission & Ecosystem Value

Mission PlusTwo is a free, open-source intelligent study planning and timetable generation system purpose-built for students taking the Kerala Directorate of Higher Secondary Education (DHSE) Class 12 (+2) board examinations and Plus One Improvement examinations.

Mission PlusTwo is free and MIT-licensed. Planning and guest progress work in the browser, with offline support after caching. Optional Google sign-in and Firestore sync process account information and study plans. Analytics integrations exist. Zero personal-data collection and statutory compliance are not established by this portfolio.

---

## 2. Maintainer Role & Project History

| Dimension | Verified Fact | Source |
| :--- | :--- | :--- |
| **Maintainer Identity** | Sreyas T S (`sreyasts`) | Git commit history, GitHub Profile |
| **Commit Contributions** | 70+ verified commits on `main` branch | Git log (`sreyasts52@gmail.com`) |
| **Project Inception** | September 2026 | GitHub API (`created_at: 2026-09-19T03:42:25Z`) |
| **Production Deployment** | Firebase Hosting (`mission-plustwo.web.app`) | Firebase CLI project `mission-plustwo` |
| **Release Management** | Semantic versioning (`v6.3.0`) with automated test validation | GitHub Releases API |
| **Issue Triage & Resolution** | Triaged & resolved Issue #3 with documentation & schema | GitHub Issues API |

---

## 3. Technical Quality & Rigorous Engineering

| Quality Invariant | Measured Result | Source Document |
| :--- | :--- | :--- |
| **Automated Unit Tests** | 53 / 53 PASSING across 5 test suites | Vitest (`tests/*.test.js`) |
| **Legacy Invariant Verification** | 551 / 551 PASSING (Scenarios A-Y, 500 fuzz tests) | `tests/engine_test.cjs` |
| **Curriculum Adapter Extensibility** | Modular adapter framework for external boards | `src/adapters/index.js` |
| **Chapter Coverage Rate** | 100.0% across all syllabi | `docs/BENCHMARKS.md` |
| **Duplicate Schedule Rate** | 0.0% | `docs/BENCHMARKS.md` |
| **Chronological Inversions** | 0 violations (Strict topological prerequisite sort) | `docs/BENCHMARKS.md` |
| **Offline Vector QR Sharing** | Zero-dependency client-side SVG QR generation | `src/utils/qr.js`, `tests/qr.test.js` |
| **Workload Variance** | 0.44 (40% lower variance than naive sequential baseline) | `scripts/benchmark-planner.js` |
| **Security Auditing** | No independent security or statutory compliance audit established | Implementation and tests do not prove compliance |
| **Continuous Integration** | Automated test, lint, and benchmark execution on push/PR | `.github/workflows/ci.yml` |

---

## 4. Adoption, Community & Traffic Evidence

*All metrics measured directly via GitHub REST APIs on 2026-09-24:*

- **GitHub Stars**: 5 (`stargazers_count`)
- **GitHub Forks**: 1 (`forks_count`)
- **14-Day Git Clones**: 465 total clones by 163 unique developers* (`/traffic/clones`)
  - *\*Note on clones: Includes automated CI/CD runners and security auditing bots alongside human developers; verified 21 unique organic repository visitors in the same 14-day window.*
- **14-Day Repository Views**: 162 total views by 21 unique visitors (`/traffic/views`)
- **High-Intent Inbound Acquisition Pages**:
  - `/pages/exam-countdown.html` (Kerala Plus Two live exam countdown & daily capacity load calculator)
  - `/pages/backlog-recovery-planner.html` (70/30 interleaved catch-up schedule generator)
  - `/pages/plus-two-timetable.html` (Complete daily study schedule & practical lab exam strategy)
  - `/pages/study-hours-calculator.html` (Interactive school day vs holiday hour calculator)
- **Community Issue On-Ramps**: 2 active `good first issue` tickets for open-source contributors (#1 Malayalam glossary, #2 a11y mobile indicators)
- **Official Releases**: `v6.3.0`

---

## 5. Why OpenAI Codex Supports This Mission

1. **Regional Education**: The intended audience is Kerala DHSE students who need daily study planning. Audience size, independent reach and educational impact have not been verified here.
2. **Deterministic & AI-Assisted Syllabus Processing**: Maintaining up-to-date state board syllabus mappings, textbook chapter splits, and Malayalam translations requires continuous natural-language parsing of government notifications. OpenAI Codex tooling directly accelerates:
   - Automated DHSE examination circular scraping and timetable parsing.
   - Translation generation and validation for regional Malayalam educational terminology.
   - Curriculum adapter development for neighboring state boards (Tamil Nadu HSE, Karnataka PUC, CBSE).
3. **Open Source**: The codebase is available under the MIT License. Guest planning needs no account; optional sign-in and cloud sync process account information. Do not claim zero PII collection.
