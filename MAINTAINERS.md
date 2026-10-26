# Project Maintainers & Response Commitments

## 👑 Principal Maintainer

| Name | Role | GitHub Handle | Email | Timezone |
| :--- | :--- | :--- | :--- | :--- |
| **Sreyas T S** | Project Lead & Creator | [`@sreyasts`](https://github.com/sreyasts) | `sreyasts52@gmail.com` | IST (UTC+5:30) |

---

## ⏱️ Service Level Agreement (SLA) for Community Contributions

To foster an authentic, responsive open-source ecosystem, the project maintainer adheres to the following response commitments:

1. **Issue Triage**: Every newly opened GitHub issue will be triaged within **48 hours** with appropriate labels (`bug`, `enhancement`, `syllabus-update`, `good first issue`, `documentation`, or `maintainer-authored`).
2. **Pull Request Review**: Every pull request that passes automated CI tests (`npm test`, `npm run test:legacy`, `npm run lint`) will receive actionable architectural review or approval within **48 hours**.
3. **Emergency Fixes**: Critical bugs affecting exam dates, syllabus errors in the upcoming DHSE board examinations, or security issues will be addressed within **24 hours**.

---

## 🛡️ Core Maintainer Invariants

The maintainer commits to upholding the following architectural and ethical invariants:

1. **Zero Synthetic Signals**: Zero fake, purchased, or swapped stars, forks, automated traffic, bot accounts, or synthetic reviews. If an issue or PR is authored by the maintainer, it is explicitly tagged `maintainer-authored`.
2. **Deterministic Scheduling Engine**: Study timetable allocations are deterministic, reproducible, and verifiable. PRs affecting the core engine (`src/engine/planner.js` or `src/core/scheduler.js`) must pass all 551 legacy invariant checks and Vitest test suites.
3. **Student Privacy First**: HSS Planner operates by default in 100% offline Guest Mode with zero Personally Identifiable Information (PII) collection. Any cloud sync features must strictly require affirmative parent/guardian consent under India's Digital Personal Data Protection (DPDP) Act 2023.
4. **Kerala DHSE / SCERT Canon**: All chapter listings, mark weights, and part splits must strictly reflect the official Kerala State Board SCERT Scheme of Work.
5. **Dual-Domain Production Continuity**: Every release must deploy cleanly across both primary hosting ([`hss-planner.web.app`](https://hss-planner.web.app/)) and GitHub Pages mirror.

---

## 📬 Contact & Escalation

- **Bug Reports & Feature Requests**: [Open a GitHub Issue](https://github.com/sreyasts/hss-planner/issues)
- **General Questions & Discussions**: [Join GitHub Discussions](https://github.com/sreyasts/hss-planner/discussions)
- **Security Vulnerabilities**: Refer to [SECURITY.md](SECURITY.md) or email `sreyasts52@gmail.com` with `[SECURITY]` in the subject line.
