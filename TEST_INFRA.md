# TEST_INFRA: Schedule Rebalancing, Auto-Detect & Rebalance Workflow, and Curriculum Integrity

## 1. Test Architecture & Opaque-Box Philosophy

### 1.1 Requirement-Driven Opaque-Box Testing
This test infrastructure specification defines the verification architecture for the **Schedule Rebalancing Reliability, Intelligent Auto-Detect & Rebalance Workflow, and Comprehensive Curriculum Audit** in the Kerala Higher Secondary (+1 & +2) Study Planner.

All test suites conform strictly to the **Opaque-Box Testing Philosophy**:
- **Authoritative Derivation**: Test inputs, expected behaviors, state transitions, and acceptance invariants are derived directly from the canonical user requirements in `ORIGINAL_REQUEST.md` (2026-11-06T02:42:34Z: Requirements R1, R2, R3, R4) and the architectural contracts in `PROJECT.md`.
- **Implementation Independence**: Tests evaluate public contract interfaces, timetable states, scheduling invariants, and schema validity. Tests do not rely on or mirror private internal implementation tricks, guaranteeing that tests remain robust across future engine refactorings.
- **Strict Anti-Cheat & Integrity Standards**: Zero facade tests, zero tautological assertions (e.g. `expect(x).toBe(x)`), zero self-mocking duplicates, and zero unfalsifiable (`|| true`) fallbacks. Every test actively exercises genuine planner logic and assertions will immediately fail if business logic violates invariants.

---

## 2. Test Design Methodology

The test suite applies four complementary formal testing methodologies:

```
+-----------------------------------------------------------------------------------+
|                            FORMAL TESTING METHODOLOGY                             |
+-----------------------------------------------------------------------------------+
|  1. Category-Partitioning        |  Equivalence classes across streams, grades,  |
|                                  |  term scopes, and completion states            |
|  2. Boundary Value Analysis      |  Extreme boundaries: 0 tasks, 100% tasks,      |
|                                  |  P1 done / P2 pending, 1-14 day gaps, deadlines|
|  3. Pairwise Combinatorial       |  Interactions between streams, improvement     |
|                                  |  papers, intensities, rest days, and switches  |
|  4. Real-World Workload Testing  |  Multi-day realistic student journeys with     |
|                                  |  interruptions, checkmarks & auto-rebalancing  |
+-----------------------------------------------------------------------------------+
```

### 2.1 Category-Partitioning
Partitions the domain space into discrete equivalence classes:
- **Academic Grades**: Class 11 (`+1`), Class 12 (`+2`).
- **Academic Streams**: Science Computer Science (`cs`), Science Biology (`bio`), Commerce (`commerce`), Humanities (`humanities`), Improvement Only (`imp_only`).
- **Curriculum Term Scopes**: Term 1 (Onam), Term 2 (Christmas), Term 3 (Full Year / Board).
- **Study Intensities**: `light`, `balanced`, `intense`.
- **Completion Topologies**: Clean sequential (Days 1..k), Out-of-order completions (e.g., Days 1, 3, 7 completed while 2, 4, 5, 6 skipped), Partial chapters (Part 1 completed, Part 2 pending).

### 2.2 Boundary Value Analysis (BVA)
Tests critical inflection points where scheduling algorithms frequently drop items or throw arithmetic errors:
- **Minimum Completed Tasks**: 0 tasks checked (fresh start / Day 0 reset).
- **Maximum Completed Tasks**: 100% of tasks checked (curriculum completion / celebration state).
- **Partial Multi-Part Boundaries**: Chapters with 2, 3, or 4 parts where exactly Part 1 is completed.
- **Disruption Windows**: 1 day, 2 days, 3 days, 5 days, 7 days, 10 days, 14 days consecutive study gaps.
- **Deadline Boundaries**: Deadline is today, deadline is tomorrow, deadline has already elapsed (triggering 30-day auto-extension).

### 2.3 Pairwise Combinatorial Testing
Systematically covers cross-feature combinations to uncover coupling anomalies:
- Stream (`cs`, `bio`, `commerce`, `humanities`) × Study Intensity (`light`, `balanced`, `intense`).
- Rebalancing × Plus One Improvement Configuration (retaining improvement papers and exam dates).
- Rebalancing × Rest Day Rules (preserving scheduled rest days and active study allocations).
- Rebalancing × Stream Switching (switching streams mid-journey while preserving valid prior progress).

### 2.4 Real-World Workload Testing
Simulates end-to-end student journeys over multi-day timelines:
- Student follows schedule, misses days due to illness, marks specific backlog tasks, opens `#regenerate-modal`, executes Auto-Detect & Rebalance, and proceeds through all remaining study days to 100% syllabus mastery.

---

## 3. Four-Tier Test Structure & Thresholds

```
===================================================================================
                                4-TIER TEST ARCHITECTURE
===================================================================================
Tier 1: Feature Coverage (Primary Capabilities)
  - Rebalance Task Preservation (>=5 tests)
  - Multi-Part Chapter Integrity (>=5 tests)
  - Multi-Stream Rebalancing: CS, Bio, Commerce, Humanities (>=5 tests)
  - Auto-Detect Scanner: detectCompletedSyllabusProgress (>=5 tests)
  - Arranging Completed Markers: Days 1..K (>=5 tests)
  - Auto-Detect Rebalance Execution: Day K+1 Forward (>=5 tests)
  - Syllabus Schema Conformance: SCERT & DHSE (>=5 tests)
-----------------------------------------------------------------------------------
Tier 2: Boundary & Corner Cases
  - Zero Completed Tasks (Day 0 Reset)
  - 100% Syllabus Completed (Celebration Guard)
  - Partial Multi-Part Chapter Splitting
  - Non-Contiguous & Ahead-of-Schedule Days
  - Missed Day Disruption Gaps (1 to 14 Days)
  - Edge-Case Target Deadlines & Auto-Extensions
-----------------------------------------------------------------------------------
Tier 3: Cross-Feature Interactions
  - Rebalance with Plus One Improvement Papers
  - Rebalance with Study Intensity Scaling
  - Rebalance with Rest Days Preferences
  - Mid-Plan Stream Switches
  - Academic Term Scope Slicing
-----------------------------------------------------------------------------------
Tier 4: Real-World Student Lifecycle Workloads
  - Scenario 1: Plus Two CS 30-Day Disrupted Lifecycle to 100% Mastery
  - Scenario 2: Plus Two Commerce Non-Contiguous Workload & Auto-Rebalance
  - Scenario 3: Plus One Biology Dual-Term Pacing & Catch-up Journey
===================================================================================
```

---

## 4. Test Invariants & Quality Gates

Every test in `tests/rebalancing-autodetect-syllabus.test.js` enforces strict mathematical and behavioral invariants:

1. **Zero Dropped Tasks Invariant**:
   $$\text{TotalTasks}(P_{\text{unified}}) = \text{CompletedTasks}(P_{\text{unified}}) + \text{RemainingTasks}(P_{\text{unified}}) = \text{TotalCanonicalTasks}(G, S, T)$$
   No task from the active curriculum scope may ever be omitted, dropped, or lost during rebalancing.

2. **Zero Duplication Invariant**:
   $$\forall t_i, t_j \in P_{\text{unified}}, \quad t_i.\text{id} = t_j.\text{id} \iff i = j$$
   Every study task ID appears exactly once across the unified schedule.

3. **Multi-Part Topological Ordering Invariant**:
   For any multi-part chapter $C$ with parts $P_1, P_2, \dots, P_m$:
   $$\text{DayNumber}(P_k) \le \text{DayNumber}(P_{k+1}) \quad \forall k \in [1, m-1]$$
   A higher part number can never be scheduled on a calendar day before a lower part number.

4. **Completed Marker Invariant**:
   All completed tasks must be encapsulated into historical completed marker days:
   $$\text{DayNumber}(d) \in [1, K], \quad \forall t \in d.\text{tasks}: t.\text{completed} = \text{true}$$

5. **Recalculation Anchor Invariant**:
   Remaining uncompleted tasks are scheduled strictly starting from Day $K+1$ forward, beginning on or after the rebuild start date:
   $$\text{DayNumber}(d_{\text{remaining}}) \ge K + 1$$

6. **Schema Conformance Invariant**:
   - 100% of chapters in `src/data/syllabus-plus-one.js` and `src/data/syllabus-plus-two.js` strictly validate against `src/data/syllabus-schema.json`.
   - 100% of stream curriculum files in `data/kerala-dhse/*.json` strictly validate against `schemas/curriculum.schema.json`.

---

## 5. Execution & Verification Commands

```powershell
# Run the target test suite with Vitest
npx vitest run tests/rebalancing-autodetect-syllabus.test.js

# Run full Vitest regression suite across all test files
npm test

# Run legacy engine invariant checks (553 checks)
npm run test:legacy

# Verify production Vite build and asset synchronization
npm run build
```
