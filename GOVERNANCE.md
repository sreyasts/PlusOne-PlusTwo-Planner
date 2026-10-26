# HSS Planner Project Governance

This document describes the decision-making model, contributor roles, and release policies for **HSS Planner**.

---

## 1. Governance Model

HSS Planner operates under a **Benevolent Dictator for Life (BDFL) / Principal Maintainer model**, led by **Sreyas T S** (`@sreyasts`).

The project values community consensus, respectful technical debate, empirical benchmarks, and student utility. While the Principal Maintainer holds final decision-making authority on architecture, licensing, and roadmap prioritization, design choices are deliberated openly in GitHub Discussions and Pull Requests.

---

## 2. Roles and Responsibilities

### 👤 Community Users & Students
- Report defects, usability friction, or syllabus discrepancies via GitHub Issues.
- Suggest enhancements and discuss study tactics in GitHub Discussions.
- Share printable timetables and notice board posters with classmates and study groups.

### 💻 Contributors
- Anyone who submits code, documentation, syllabus data, translations, or tests via Pull Requests.
- Expected to adhere to the [Code of Conduct](CODE_OF_CONDUCT.md) and [Contributing Guide](CONTRIBUTING.md).
- Must ensure all automated test suites pass (`npm test`, `npm run test:legacy`, `npm run lint`) prior to requesting review.

### 👑 Principal Maintainer
- Accountable for project direction, repository security, CI/CD pipelines, and domain deployments.
- Maintains a 48-hour SLA for triaging issues and reviewing pull requests.
- Publishes releases following Semantic Versioning (`MAJOR.MINOR.PATCH`).
- Enforces the project's zero-synthetic-signals integrity policy.

---

## 3. Decision-Making & Review Process

All architectural changes follow a transparent pull request workflow:

1. **Proposal / Issue**: Non-trivial changes (e.g. modifying scheduling heuristics, adding curriculum adapters, altering data schema) should begin with a GitHub Issue or Discussion post explaining the rationale.
2. **Implementation & Tests**: The PR author must provide unit tests verifying the change, along with updated documentation if user behavior changes.
3. **Automated Validation**: CI must execute successfully:
   - Vitest unit tests: 100% pass rate.
   - Regression engine invariants: 551 checks must pass.
   - ESLint: zero errors, zero warnings.
4. **Maintainer Review**: The PR is reviewed within 48 hours for code readability, performance impact, and adherence to DPDP Act 2023 privacy standards.
5. **Merge**: Once approved, changes are merged to `main` and automatically deployed to production.

---

## 4. Release Process

1. Releases adhere to [Semantic Versioning 2.0.0](https://semver.org/):
   - **Patch (`x.y.Z`)**: Backward-compatible bug fixes, syllabus typo corrections, styling fixes.
   - **Minor (`x.Y.z`)**: New features, new stream adapters, additional tools that maintain backward compatibility.
   - **Major (`X.y.z`)**: Breaking architectural changes to the state schema, data model, or scheduling interface.
2. Every release is cataloged in [CHANGELOG.md](CHANGELOG.md) with traceable commit links and user-facing summaries.

---

## 5. Code of Conduct Enforcement

The project strictly adheres to the [Contributor Covenant](CODE_OF_CONDUCT.md). Harassment, abusive behavior, or spam will result in temporary or permanent bans from the repository. Reports may be sent directly to `sreyasts52@gmail.com`.
