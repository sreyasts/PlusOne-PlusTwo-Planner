# Contributing to +1 & +2 Planner

Thank you for your interest in contributing to **+1 & +2 Planner**! This open-source project provides a free, deterministic, privacy-first study planning and timetable generation platform for students taking the Kerala Directorate of Higher Secondary Education (DHSE) examinations.

Whether you are a student correcting a syllabus typo, a teacher refining difficulty weightings, a translator polishing Malayalam phrasing, or an engineer improving our scheduling engine, your contribution is deeply appreciated.

---

## 1. Code of Conduct

All contributors and participants are expected to uphold the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). Please treat fellow students, educators, and maintainers with empathy, respect, and constructive encouragement.

---

## 2. Ways to Contribute

You do not need to be an expert programmer to make high-impact contributions:

1. **Syllabus & Curriculum Corrections** (`good first issue`):
   - Kerala SCERT/DHSE periodically updates chapter rationalizations and exam schemes of work. Help us ensure all chapter names, textbook unit numbers, and marks allocations match official state board notifications.
   - Reference: [How to Update Syllabus Data](docs/how-to-update-syllabus.md).
2. **Malayalam Translations** (`good first issue`):
   - Help translate and refine student-facing guidance, tips, and chapter titles into natural, accessible Malayalam.
   - Reference: [Malayalam Translation Guide](docs/TRANSLATION-GUIDE.md).
3. **Accessibility & Responsive UI** (`good first issue`):
   - Test the planner on entry-level Android devices, screen readers, and low-contrast mobile environments.
   - Reference: [Accessibility Standards](docs/ACCESSIBILITY-GUIDE.md).
4. **Planning Engine & Heuristics**:
   - Improve the greedy constraint-propagation algorithm in `src/engine/planner.js`, handle tricky holiday runways, or optimize benchmark variance.
5. **Documentation & Student Guides**:
   - Write clear, practical revision and exam preparation guides for Plus Two students.

---

## 3. Local Development Setup

### Prerequisites
- **Node.js**: `>= 18.0.0` (v20+ recommended)
- **npm**: `>= 9.0.0`
- **Git**

### Step-by-Step Setup

```bash
# 1. Fork the repository on GitHub, then clone your fork:
git clone https://github.com/<your-username>/PlusOne-PlusTwo-Planner.git
cd PlusOne-PlusTwo-Planner

# 2. Install dependencies:
npm install

# 3. Start local development server with Hot Module Replacement (HMR):
npm run dev

# 4. Open http://localhost:5173 in your browser
```

---

## 4. Project Structure

```
PlusOne-PlusTwo-Planner/
├── index.html                 # Main web application entry point
├── src/
│   ├── app.js                 # Reactive application state, UI rendering, event dispatch
│   ├── main.js                # Vite application bootstrap & module wiring
│   ├── engine/
│   │   └── planner.js         # Deterministic constraint-propagation scheduler
│   ├── data/
│   │   └── syllabus.js        # Kerala DHSE rationalized subject & chapter schemas
│   ├── analytics/
│   │   └── tracker.js         # Anonymous, DPDP Act & GDPR compliant telemetry
│   ├── i18n/                  # Bilingual localization dictionaries (EN/ML)
│   └── style.css              # Custom utility styles and animations
├── tests/
│   ├── engine.test.js         # Modern Vitest unit tests (35+ test cases)
│   └── engine_test.cjs        # Legacy invariant regression suite (402 checks)
├── scripts/
│   ├── benchmark-planner.js   # Empirical benchmark runner vs naive baselines
│   └── post-build.js          # Deployment asset integrity script
├── docs/                      # Technical architecture, algorithm specs, and guides
└── pages/                     # Search-intent landing pages and legal policies
```

---

## 5. Verification & Testing Standards

Before opening a pull request, run the complete local verification pipeline:

```bash
# Run the primary Vitest unit test suite
npm test

# Run the 402 invariant checks (schedule legality & collision prevention)
npm run test:legacy

# Run empirical scheduler benchmarks
npm run benchmark:planner

# Run the linter
npm run lint

# Verify production build compilation
npm run build
```

---

## 6. Pull Request & Review Process

1. **Create a Feature Branch**:
   ```bash
   git checkout -b fix/syllabus-chemistry-unit4
   ```
2. **Commit with Clear Intent**:
   - Use descriptive Conventional Commit style messages: `fix(syllabus): update Chemistry unit 4 chapter name to 2026 circular`.
3. **Open a Pull Request**:
   - Fill out our [PR Template](.github/pull_request_template.md).
   - If proposing a syllabus change, include a direct link or citation to the official Kerala DHSE circular.
4. **Code Review & Triage**:
   - A maintainer will review your PR within 48 hours.
   - All automated GitHub Actions CI checks must pass before merging.
   - Once merged, your changes will automatically deploy to [https://hss-planner.web.app/](https://hss-planner.web.app/) in the next release!
