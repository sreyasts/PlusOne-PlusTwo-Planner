# E2E Test Infra: HSS Planner

## Test Philosophy
- Opaque-box, requirement-driven testing derived from `ORIGINAL_REQUEST.md` and user-facing specifications.
- Independent decomposition: Validates student study progression, disruption recovery, storage persistence, and UI synchronization without relying on internal implementation details.
- Methodology: Category-Partition + Boundary Value Analysis (BVA) + Pairwise Combinatorial Testing + Real-World Workload Testing.

## Feature Inventory
| # | Feature | Source (Requirement) | Tier 1 (Coverage) | Tier 2 (Boundary) | Tier 3 (Cross-Feature) |
|---|---------|----------------------|:-----------------:|:-----------------:|:----------------------:|
| 1 | +1 CS Full Lifecycle | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 2 | +1 Biology Full Lifecycle | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 3 | +1 Commerce Full Lifecycle | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 4 | +1 Humanities Full Lifecycle | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 5 | +2 CS Full Lifecycle | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 6 | +2 Biology Full Lifecycle | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 7 | +2 Commerce Full Lifecycle | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 8 | +2 Humanities Full Lifecycle | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 9 | Pacing Presets (30d, 60d, Board) | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 10 | Missed Days Disruption (1–14d) | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 11 | "Adjust Plan" Rebalancing | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 12 | Past-Deadline Rebalance Guard | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 13 | Calendar & Timezone Boundaries | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 14 | Mid-Journey Reconfiguration | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 15 | UI State Synchronization | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 16 | Storage Persistence & Rollback | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 17 | Version 6 Backup Roundtrip | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 18 | 100% Completion Celebration | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |

## Test Architecture
- **Test Runner**: Vitest (`npm test`) and custom simulation runners (`node tests/...`).
- **Test Case Format**: ES Modules with strict assertions on state invariants, schema conformance, zero task drop/duplication, date monotonicity, and UI reactive contracts.
- **Directory Layout**:
  - `tests/e2e/`: End-to-end integration and simulation specs.
  - `tests/simulation/`: Multi-day simulation engines and lifecycle test harnesses.
  - `tests/stress/`: Disruption injection, 1–14 missed day rebalancers, and boundary stress tests.

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | +2 Bio Student 60-Day Sprint to Board Exams | F6, F9, F11, F15, F18 | High |
| 2 | +1 CS Student with 7-Day Illness & Mid-Plan Rebalance | F1, F10, F11, F12, F15 | High |
| 3 | +2 Commerce Student Switching Study Hours & Rest Days | F7, F11, F14, F16 | Medium |
| 4 | Offline PWA Student Completing Syllabus with Device Backup Roundtrip | F2, F16, F17, F18 | High |
| 5 | +1 Humanities Student Finishing 100% Curriculum on Leap Year | F4, F13, F15, F18 | High |

## Coverage Thresholds
- Tier 1: ≥5 tests per feature (Happy path equivalence classes)
- Tier 2: ≥5 tests per boundary/corner condition (Min/max runway, 1 vs 14 missed days, leap years)
- Tier 3: Pairwise coverage across feature interactions (Stream × Pacing × Disruption)
- Tier 4: ≥5 realistic full-lifecycle application scenarios
