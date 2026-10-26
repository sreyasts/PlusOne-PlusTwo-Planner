# HSS Planner — System Architecture

## 1. Overview & High-Level System Design

HSS Planner is a client-side progressive web application (PWA) tailored specifically for Kerala Higher Secondary Examination (DHSE) students across Class 11 Improvement and Class 12 (+2) curricula. The system operates under a local-first, offline-capable architecture where all schedule synthesis, dependency resolution, and state updates run deterministically in the client browser with zero mandatory backend roundtrips.

```mermaid
flowchart TD
    User["Student / Client Device"]
    PWA["PWA Shell (Service Worker + Vite SPA)"]
    Data["Canonical Syllabus Layer (SCERT 2025-26 Scheme of Work)"]
    Engine["Deterministic Planning Engine (v6.1.0)"]
    Validation["Plan Validation & Invariant Suite"]
    State["Local Storage & IndexedDB"]
    Cloud["Cloud Firestore (Optional Auth & Cross-Device Sync)"]

    User -->|Defines Stream, Target Deadline, +1 Exams| PWA
    PWA --> Engine
    Data --> Engine
    Engine --> Validation
    Validation -->|Verified Daily Schedule| PWA
    PWA -->|Persists Progress| State
    State <-->|Async Merge| Cloud
```

---

## 2. Planning Engine Architecture

The scheduler is structured as a multi-phase, constraint-driven deterministic pipeline:

```mermaid
flowchart LR
    subgraph Inputs
        A[Canonical Syllabus]
        B[Runway Parameters: Start & Deadline]
        C[Improvement Exam Dates]
        D[Personalization: Rhythm & Hours]
    end

    subgraph Pipeline
        E[Runway & Revision Sizing]
        F[Phase 1: +1 Improvement Scheduler]
        G[Phase 2: +2 State Machine & Interleaver]
        H[Phase 3: Spaced Revision Synthesis]
        I[Phase 4: Invariant Validation Layer]
    end

    subgraph Output
        J[Validated Daily Schedule]
        K[Capacity & Health Diagnostics]
    end

    A & B & C & D --> E
    E --> F
    F --> G
    G --> H
    H --> I
    I --> J & K
```

### 2.1 Core Modules & Responsibilities

1. **`src/engine/planner.js`**:
   - `buildIntelligentPlan(options)`: Unified entry point for schedule generation.
   - `_executeCorePlanAlgorithm(...)`: Core 4-phase scheduling pipeline.
   - `validatePlan(plan, tasks, options)`: Invariant verification assessing duplicates, ordering, deadline bounds, and coverage.
   - `getCanonicalTasks(stream, termScope, ...)`: Extracts active curriculum scope based on student stream and chosen improvement subjects.

2. **`src/engine/migration.js`**:
   - `migrateLegacyUserPlan(storedState)`: Idempotently migrates user profiles, checkmarks, custom notes, and timetable layouts across schema versions (v2 -> v6) without data loss.

3. **`src/data/syllabus-plus-two.js` & `syllabus-plus-one.js`**:
   - Canonical syllabus definitions grounded in the official SCERT Kerala Scheme of Work.
   - Encodes chapter IDs, part divisions, estimated completion durations (minutes), term boundaries, and prerequisite links.

---

## 3. Data Flow & State Lifecycle

```mermaid
sequenceDiagram
    autonumber
    actor Student
    participant UI as WebApp UI
    participant Planner as Planning Engine
    participant Invariants as Validation Engine
    participant Store as LocalStorage / IDB
    participant Cloud as Cloud Firestore

    Student->>UI: Selects Stream, Exam Dates & Daily Rhythm
    UI->>Planner: buildIntelligentPlan(config)
    Planner->>Planner: Calculate Runway & Reserve Revision Days
    Planner->>Planner: Schedule +1 Improvement tasks prior to exam dates
    Planner->>Planner: Interleave +2 chapters preserving sequential part flow
    Planner->>Planner: Synthesize PYQ, Formula Recall & Mock Exam days
    Planner->>Invariants: validatePlan(plan, tasks)
    Invariants-->>Planner: Invariant Scorecard (Coverage, Ordering, Deadlines)
    Planner-->>UI: Complete Verified Plan Days & Diagnostics
    UI->>Store: Save planDays & taskCompletionState
    opt Cloud Sync Enabled
        UI->>Cloud: Write user state to users/{userId}
    end
```

---

## 4. Canonical Syllabus & Task Model

Every study unit represents an atomic syllabus part conforming to JSON schema specifications (`src/data/syllabus-schema.json`):

```json
{
  "id": "P2_PHY_01_P1",
  "grade": "+2",
  "subject": "Physics",
  "chapNumber": 1,
  "chapId": "P2_PHY_01",
  "chapterName": "Electric Charges and Fields",
  "part": 1,
  "totalParts": 3,
  "topicTitle": "Coulomb's Law, Electric Field & Dipole Moments",
  "term": 1,
  "estimatedMinutes": 60,
  "prerequisiteId": null
}
```

For parts with `part > 1`, `prerequisiteId` links strictly to `P{grade}_{SUB}_{chapNumber}_P{part-1}`.

---

## 5. Deployment & Runtime Architecture

- **Bundle Tooling**: Built with Vite 8 and Tailwind CSS 4, generating optimized ES modules with code splitting.
- **PWA Service Worker**: Cache-first strategy for static assets and local syllabus databases (`sw.js`). Installs as a standalone WebAPK on Android and Progressive Web App on desktop/iOS.
- **Persistence**: Multi-tiered offline storage:
  - Fast memory state during runtime.
  - Synchronous LocalStorage serialization for immediate recovery.
  - Asynchronous Cloud Firestore sync under `/users/{userId}` for authenticated cross-device sync.

---

## 6. Ecosystem Expansion & Curriculum Adapter Pattern

The core planning engine in `src/engine/planner.js` is architected with a strict separation between the **Constraint-Propagation Scheduling Engine** and the **Curriculum Data Layer**:

```
+-----------------------------------------------------------+
|              Core Scheduling Engine (planner.js)          |
|  - Dependency Topological Sort   - Workload Variance Clamping
|  - Pacing Capacity Balancer      - Revision Buffer Calculator
+-----------------------------+-----------------------------+
                              |
              +---------------+---------------+
              |                               |
              v                               v
+-----------------------------+ +-----------------------------+
|    Kerala DHSE Adapter      | |   Generic Curriculum Adapter |
|  - SCERT Science Syllabus   | |  - CBSE Class 12            |
|  - +1 Improvement Weaving   | |  - Karnataka PUC / TN HSE   |
+-----------------------------+ +-----------------------------+
```

### Implemented Curriculum Adapters (`src/adapters/`)
HSS Planner includes first-class curriculum adapter implementations located in `src/adapters/`:

1. **`CurriculumAdapter` (`src/adapters/CurriculumAdapter.js`)**: Abstract base class providing task validation (`CurriculumAdapter.validateTask`), subject aggregation, chapter-part hierarchy grouping, and planning payload conversion.
2. **`KeralaDHSEAdapter` (`src/adapters/KeralaDHSEAdapter.js`)**: Encapsulates the canonical Kerala SCERT syllabus for Science, Commerce, and Humanities streams, including dual-stream +1 Improvement interweaving.
3. **`CBSEClass12Adapter` (`src/adapters/CBSEClass12Adapter.js`)**: Concrete adapter providing the rationalized NCERT curriculum for CBSE Class 12 Senior School Certificate Examination (Physics, Chemistry, Mathematics, Biology, English Core, Computer Science).

#### Using an Adapter with the Engine
```javascript
import { CBSEClass12Adapter } from './src/adapters/index.js';
import { buildIntelligentPlan } from './src/engine/planner.js';

// Instantiate the CBSE Class 12 Science adapter
const adapter = new CBSEClass12Adapter({ stream: 'pcm_cs' });

// Generate an intelligent, dependency-preserving day-by-day study schedule
const schedule = buildIntelligentPlan({
  adapter,
  startDateStr: '2026-10-01',
  deadlineDateStr: '2027-02-15',
  personalization: {
    weeklyRhythm: 'weekend_booster'
  }
});
```

#### Raw Task Ingestion
Direct task objects matching the standard schema can also be scheduled directly without an adapter class:

```javascript
import { buildIntelligentPlan } from './src/engine/planner.js';

const customCurriculumTasks = [
  {
    id: "CBSE_12_MTH_01_P1",
    grade: "12",
    subject: "Mathematics",
    chapNumber: 1,
    chapId: "CBSE_12_MTH_01",
    chapterName: "Relations and Functions",
    part: 1,
    totalParts: 2,
    topicTitle: "Types of Relations and Equivalence",
    estimatedMinutes: 60,
    prerequisiteId: null
  },
  {
    id: "CBSE_12_MTH_01_P2",
    grade: "12",
    subject: "Mathematics",
    chapNumber: 1,
    chapId: "CBSE_12_MTH_01",
    chapterName: "Relations and Functions",
    part: 2,
    totalParts: 2,
    topicTitle: "One-One, Onto and Bijective Functions",
    estimatedMinutes: 60,
    prerequisiteId: "CBSE_12_MTH_01_P1"
  }
];

const customSchedule = buildIntelligentPlan({
  tasks: customCurriculumTasks,
  startDateStr: "2026-10-01",
  deadlineDateStr: "2026-12-15"
});
```

This permits any educational board or open-source community to leverage HSS Planner's verified, bug-free scheduling engine without modifying core codebase algorithms.

