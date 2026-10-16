# OpenAI Codex for Open Source — Application Preparation Draft

Updated 16 October 2026. This is a preparation draft, not a submitted application. The [current scorecard](CODEX-READINESS-SCORECARD.md) records evidence and limits. Request only the six-month ChatGPT Pro maintainer benefit; the owner has put submission on hold.

---

## 1. Candidate Application Details

### GitHub Username
`sreyasts`

### Public Repository URL
`https://github.com/sreyasts/intelligent-study-planner-for-plus-two-`

### Primary Maintainer Role
Primary Creator, Lead Architect & Maintainer

---

## 2. Why Does This Repository Qualify? (500-Character Limit)

> [!IMPORTANT]
> **Strict Limit**: 500 characters (including spaces).

### Draft Submission Text:
```text
I maintain Mission PlusTwo, an MIT-licensed study planner for Kerala Plus Two and Plus One improvement students. Its public app supports guest planning, English/Malayalam guidance, task tracking and schedule recovery; the scheduling core is reusable. I maintain the code, tests and releases. ChatGPT Pro with Codex would support regression fixes, accessibility and curriculum maintenance. Independent adoption is not yet verified; I am applying on the project's educational utility.
```

**Character Count Verification**:
* Length: **482 characters** (under the 500-character maximum).
* Verified Claims:
  - Repository role: Primary maintainer (`sreyasts`); public repository and release history support this role.
  - Validation: 93 unit tests, 553 planner checks and five browser scenarios pass for v6.4.2.
  - Benchmarks: Documented in [`docs/BENCHMARKS.md`](BENCHMARKS.md) and executed by [`scripts/benchmark-planner.js`](../scripts/benchmark-planner.js).
  - Audience: Intended for Kerala DHSE students; independent active users and educational outcomes are unverified.

---

## 3. Benefit Requested and Prior Application

No API credits are requested. ChatGPT Pro with Codex would support the following maintainer work; these are intended uses, not claims of deployed automation:

1. **Curriculum Invariant & PR Review**:
   - Using Codex interactively to review syllabus updates against SCERT Scheme of Work references, then verifying changes with the regression suite and maintainer review. No API bot or API funding is part of this request.
2. **Community Issue Triage & Malayalam Localization Assistant**:
   - Assisting in triaging inbound bug reports and validating student Malayalam translation suggestions (`src/i18n/ml.js`) for grammatical and contextual naturalness in Kerala educational contexts.
3. **Automated Fuzzing & Regression Test Generation**:
   - Expanding regression coverage for complex exam date constraints (e.g. leap years, overlapping national holidays, split exam schedules).
4. **Release Notes & Migration Verification**:
   - Analyzing git diffs between releases to verify state-migration idempotence (`src/engine/migration.js`) and draft precise changelog summaries.

---

The owner reports an earlier application when this repository was new. Its date and outcome are unverified. Use the scorecard's optional disclosure; do not submit duplicates automatically or describe the previous application as rejected without evidence.

## 4. Additional Context & Project Links

- **Live Production Application**: [https://mission-plustwo.web.app/](https://mission-plustwo.web.app/)
- **Algorithm Formal Specification**: [`docs/ALGORITHM.md`](ALGORITHM.md)
- **Empirical Benchmarks**: [`docs/BENCHMARKS.md`](BENCHMARKS.md)
- **Forensic Baseline Audit**: [`docs/OSS-GROWTH-BASELINE.md`](OSS-GROWTH-BASELINE.md)
- **Privacy & Telemetry Specification**: [`docs/USAGE-METRICS.md`](USAGE-METRICS.md)
- **Live Impact Ledger**: [`docs/IMPACT.md`](IMPACT.md)
