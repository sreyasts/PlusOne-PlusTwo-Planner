# Mission PlusTwo — Engineering & Adoption Roadmap (2026–2027)

> **North Star Objective**: Make Mission PlusTwo the most trusted, scientifically grounded, and widely adopted free study planning platform for Kerala Higher Secondary (DHSE) students, reaching 100,000+ legitimate students through organic word-of-mouth, teacher endorsements, and peer study networks — while demonstrating exemplary open-source software maintenance.

---

## 🗺️ Roadmap Overview

```
+-----------------------------------------------------------------------------------+
|                        ENGINEERING & PRODUCT PILLARS                              |
|                                                                                   |
|  Phase 1: Deterministic Engine Core (v6.0 - v6.1)        [✅ COMPLETED - Sep 2026] |
|  Phase 2: Product Growth & Tool Architecture (v6.2 - v6.3)[✅ COMPLETED - Sep 2026]|
|  Phase 3: Interactive Revision & Spaced Recall (v6.4)    [🔄 IN PROGRESS - Q4 2026]|
+-----------------------------------------------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
|                         ADOPTION & COMMUNITY PILLARS                              |
|                                                                                   |
|  Track A: Classroom & Teacher Grassroots Network (PTA, HSST teacher toolkits)     |
|  Track B: Peer-to-Peer Study Loops (Printable QR codes, WhatsApp/Telegram shares) |
|  Track C: High-Intent Search Acquisition (Countdown, Backlog, Calculator tools)   |
|  Track D: Open Source Contributor On-Ramps (Covenant 2.1, good first issues)      |
+-----------------------------------------------------------------------------------+
```

---

## Part 1: Engineering & Architecture Roadmap

### Phase 1: Deterministic Core & Zero-Defect Scheduling (v6.0 – v6.1) • ✅ Completed
*Focus: Mathematical stability, invariant verification, and offline resilience.*

- [x] **Topological Constraint Engine**: Strict prerequisite chaining ensuring Part 1 always precedes Part 2.
- [x] **Continuous Accumulator Pacing**: Bresenham-inspired workload balancing achieving an 88% reduction in daily workload variance over naive sequential scheduling.
- [x] **Dual-Stream Improvement Weaving**: Dynamically interleaves +1 Improvement exam chapters ahead of test dates while advancing regular +2 syllabus.
- [x] **Empirical Benchmark Suite**: Automated comparative harness (`scripts/benchmark-planner.js` and `docs/BENCHMARKS.md`) validating coverage, duplicate rates, and order integrity across randomized runs.
- [x] **Offline-First PWA**: Service Worker (`sw.js`) and WebAPK-compliant manifest for 100% offline usability on budget devices.
- [x] **Test Harness**: 551 legacy invariant checks across scenarios A–Y and 500 fuzz iterations.

---

### Phase 2: Product-Led Growth & Curriculum Adapter Architecture (v6.2 – v6.3) • ✅ Completed
*Focus: Viral distribution mechanisms, standalone web tools, and modular board extensibility.*

- [x] **Product-Led Sharing Engine**:
  - Integrated Web Share API with instant WhatsApp and Telegram fallbacks.
  - 1-click clipboard link copying (`copyShareLink()`) with visual toast feedback.
  - CSV timetable export (`exportTimetableCsv()`) generating clean spreadsheet timetables.
  - High-contrast `@media print` stylesheet for physical desk-wall schedules and PDF exports.
- [x] **Offline Vector QR Code Generator (`src/utils/qr.js`)**:
  - Pure client-side SVG QR code generator with zero third-party network requests.
  - Embedded printable QR watermark card in the Full Plan view and print layout for peer-to-peer classroom scanning.
- [x] **Curriculum Adapter Framework (`src/adapters/`)**:
  - `CurriculumAdapter`: Abstract base class with task schema validation (`validateTask`), subject grouping, and planning payload conversion.
  - `KeralaDHSEAdapter`: Encapsulates canonical SCERT Plus Two and Plus One syllabi for Science, Commerce, and Humanities.
- [x] **High-Intent Search Acquisition Tools**:
  - `/pages/exam-countdown.html`: Live countdown timer to Kerala DHSE board exams, practicals, and model exams with real-time daily study load feasibility analysis.
  - `/pages/backlog-recovery-planner.html`: Evidence-based 70/30 interleaved catch-up schedule generator.
  - `/pages/plus-two-timetable.html`: Kerala Plus Two timetable guide and DHSE practical exam revision strategy.
  - `/pages/study-hours-calculator.html`: School day vs holiday study hours calculator.
  - Schema.org `WebApplication` and `FAQPage` structured data on all acquisition tools.
- [x] **Community Infrastructure**:
  - Contributor Covenant 2.1 Code of Conduct (`CODE_OF_CONDUCT.md`).
  - Standardized issue templates and pull request verification checklists.
  - Resolved GitHub Issue #3 (DHSE practical lab exam guidance).

---

### Phase 3: Interactive Revision Engine & Spaced Retrieval (v6.4) • 🔄 In Progress (Q4 2026)
*Focus: Cognitive science-backed retention, model exam simulation, and formula recall.*

- [ ] **Dynamic Model Exam Simulator**:
  - Timed 2.5-hour and 2-hour full syllabus examination simulation modes matching DHSE question blueprints.
  - Built-in timer with countdown sound cues, section markers, and mark allocation guidelines.
- [ ] **High-Yield Spaced Retrieval Cards (Flashcards)**:
  - Printable and on-screen Leitner box flashcards for high-frequency DHSE board questions:
    - *Physics*: 20 essential derivations (Gauss's law applications, Lens maker's formula, LCR resonance).
    - *Chemistry*: Named organic reactions, reagents, and salt analysis identification tables.
    - *Mathematics*: Calculus integration properties, vector cross products, and 3D skew lines formulas.
    - *Biology*: Botanical life cycles, genetics crosses, and human reproduction diagrams.
- [ ] **DHSE Exam Datesheet Auto-Scraper (`scripts/check-dhse-datesheet.js`)**:
  - Headless Node.js scraper monitoring the official `dhsekerala.gov.in` portal for model and public exam notification circulars.
  - Triggers automated GitHub Actions dispatch to update exam countdown dates upon official government release.
- [ ] **Ultra-Narrow Mobile Accessibility (<360px)**:
  - Address GitHub Issue #2: Complete accessibility audit for budget Android smartphones (JioPhone Next, Redmi Go, Samsung M-series) with enhanced touch targets (\(\ge 44\text{px}\)) and contrast compliance.

---

## Part 2: Adoption, Distribution & Community Roadmap

### Channel 1: The Teacher & School Grassroots On-Ramp
*Kerala higher secondary teachers (HSST) are the single most influential advocates for academic study tools.*

- **Actionable Steps**:
  1. Distribute the free, non-commercial teacher toolkit (`docs/distribution-growth-kit.md`) to Higher Secondary School Teachers' associations across all 14 districts of Kerala.
  2. Provide printable, high-resolution wall posters (`dist/assets/printable-timetable-qr.pdf`) for school notice boards and staff rooms with embedded vector QR codes linking to [`https://mission-plustwo.web.app/`](https://mission-plustwo.web.app/).
  3. Conduct informational workshops for Career Guidance & Adolescent Counselling Cell (CG&ACC) coordinators in government schools.

---

### Channel 2: Peer-to-Peer Study Group Network Effects
*Students study in decentralized WhatsApp and Telegram groups.*

- **Actionable Steps**:
  1. Optimize the 1-click Web Share card: When a student finishes their daily study quota, a single tap generates a clean, non-spammy summary card:
     ```
     📚 Mission PlusTwo Study Check-in:
     ✅ Covered: Electric Charges & Fields (Part 2)
     🎯 Next: Electrostatic Potential
     ⏳ 132 days until DHSE Board Exam
     Plan your timetable: https://mission-plustwo.web.app/
     ```
  2. Distribute high-yield study resources (SCERT rationalized chapter checklists) on educational Telegram channels (HSSLive, Plus Two Science Kerala, Bio-Vision).

---

### Channel 3: Search Engine Acquisition (Organic Inbound)
*Students search for exam schedules, syllabus breakdowns, and revision timetables.*

- **Target High-Intent Queries & Landing Pages**:
  - *Query*: "Kerala plus two timetable 2027" &rarr; Land on [`/pages/plus-two-timetable.html`](https://mission-plustwo.web.app/plus-two-timetable)
  - *Query*: "Plus two exam countdown live" &rarr; Land on [`/pages/exam-countdown.html`](https://mission-plustwo.web.app/exam-countdown)
  - *Query*: "Class 12 backlog recovery study plan" &rarr; Land on [`/pages/backlog-recovery-planner.html`](https://mission-plustwo.web.app/backlog-recovery-planner)
  - *Query*: "Plus two daily study hours calculator" &rarr; Land on [`/pages/study-hours-calculator.html`](https://mission-plustwo.web.app/study-hours-calculator)
  - *Query*: "+1 improvement exam date & study schedule" &rarr; Land on [`/pages/plus-one-improvement-guide.html`](https://mission-plustwo.web.app/plus-one-improvement-guide)
- **Technical SEO Hygiene**:
  - 100% valid Schema.org `WebApplication` and `FAQPage` JSON-LD markup.
  - Sub-second First Contentful Paint (FCP) on 3G network profiles.
  - Verified sitemap submissions in Google Search Console.

---

### Channel 4: Open Source Community & Maintainer Excellence
*Demonstrating rigorous open-source governance and genuine contributor on-ramps.*

- **Contributor Ecosystem**:
  - Maintain active `good first issue` backlogs for college students, teachers, and developers in Kerala.
  - Welcome syllabus revisions, Malayalam terminology improvements, and accessibility audits.
  - Maintain 100% test passing rates on all PRs through automated GitHub Actions CI.
- **Maintainer Practices**:
  - Transparent documentation of commit history, issue triage, and semantic releases.
  - Complete architectural decoupling between constraint solver and curriculum adapters.
  - Zero tolerance for fabricated metrics, fake stars, or synthetic user accounts.

---

## 📊 Adoption Milestone Ledger

| Horizon | Target Metric | Core Driver | Measurement Source |
| :--- | :--- | :--- | :--- |
| **Current Baseline** | 21 unique 14d visitors, 5 stars, 1 fork | Initial codebase release & technical hardening | GitHub REST API |
| **Q4 2026 (Model Exams)** | 1,000+ monthly active learners | Search indexing of Exam Countdown & Backlog Planner | Privacy-safe on-device telemetry (`docs/ANALYTICS.md`) |
| **Q1 2027 (Board Exam Sprint)** | 10,000+ active learners | Peer-to-peer WhatsApp share cards & teacher referrals | Client analytics (`plan_generated`, `task_completed`) |
| **Long-Term Target** | 100,000+ total beneficiaries | Institutional adoption across Kerala Higher Secondary Schools | Multi-year cumulative impact ledger (`docs/IMPACT.md`) |

---

*Authored by the Mission PlusTwo Autonomous Maintainer & Sreyas T S (`sreyasts52@gmail.com`).*  
*Licensed under the [MIT License](https://github.com/sreyasts/intelligent-study-planner-for-plus-two-/blob/main/LICENSE).*
