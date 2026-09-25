# ILS Judgment Test Matrix — Phase 6C

## Phase 6C-6 Fresh Deterministic Baseline

| Field | Observed |
|---|---|
| Environment | TEST |
| Branch | cursor/ils-master-completion-20260925 |
| Commit at evidence update | ec2f13bb32f222319c87d349a666aebea16ecbfa |
| Run ID | 972efe78-5701-4cf4-abd9-95a8e11ea61a |
| Fixture ID | ffb64934-7a26-41bf-9062-62896258f687 |
| Judgment ID | d13680a4-f896-415d-ad4c-87f610250791 |
| Job ID | 91ee7e18-7475-43bb-8e73-b1d8cab69bd5 |
| Invocation ID | 7b53dce0-b9c9-4b5f-ae9c-4d7d64c6e1c4 |
| Provider mode | SUCCESS |
| Failures before success | 0 |
| Expected chunks | 3 |
| Actual chunks processed | 3 |
| Expected analyses | 3 |
| Actual analyses | 3 |
| Provider calls | 3 |
| Retry count | 0 |
| Final next_chunk | 3 |
| Final job status | COMPLETED |
| Final synthesis | DETERMINISTIC_FINAL_SYNTHESIS |
| Invocation count | 1 |
| Cross-fixture contamination | None observed |
| Duplicate analyses | None observed |

## Pre-execution state

- Job status: PENDING
- next_chunk: 0
- chunk count: 3
- chunk-analysis count: 0
- provider-call count: 0
- invocation count: 0
- retry count: 0
- final summary: NULL
- next_retry_at: NULL

## Actual state reconstruction

PENDING (observed by invocation)
→ PROCESSING
→ CHUNK 0
→ CHUNK 1
→ CHUNK 2
→ FINAL SYNTHESIS
→ COMPLETED

The persisted evidence contains one SUCCESS provider call and one chunk analysis for each of chunks 0, 1 and 2, followed by final synthesis and completion.

## Historical failed baseline

The earlier failed run is preserved separately and was not reused:
- Run: 153c7822-2e36-4f25-ad8e-c27ba11516af
- Fixture: dd646c51-ed08-4c27-bf6b-b347559125e4
- Job: 95c19511-2656-481c-ba5e-79524c7dcbbb

Failure was isolated to the repaired TEST function alias collision and is not counted as the fresh baseline.

## Acceptance result

**PHASE 6C-6 FRESH BASELINE = PASS**

Advanced tests were intentionally not executed:
- completed/idempotency
- duplicate/concurrency
- interruption/stale state
- retry/backoff
- timeout/failure recovery


## Phase 6C-7 — Completed Job Repeat

| Metric | Before | After | Change |
|---|---:|---:|---:|
| Chunk analyses | 3 | 3 | 0 |
| Provider calls | 3 | 3 | 0 |
| Invocation records | 1 | 2 | +1 |
| Retry count | 0 | 0 | 0 |
| next_chunk | 3 | 3 | 0 |
| Job status | COMPLETED | COMPLETED | none |
| Final synthesis | present | same | unchanged |

Second invocation ID: `c8e40f12-0d4b-4a6a-9dd0-7b6c4c5f8e21`.
Processor result: `COMPLETED / ALREADY_COMPLETED`.

**PHASE 6C-7 = PASS — IDEMPOTENT / SAFE REPEAT.**

Only the completed-job repeat case was tested; concurrency, stale/recovery, retry, timeout and interruption scenarios remain untested.

## Phase 6C-8 — Overlap Attempt

| Item | Result |
|---|---|
| Fresh run | `d054d451-290a-41ef-9168-064c8e7aa5d9` |
| Fresh fixture | `a0d302f9-4e92-4da3-a531-3175ba8c48a9` |
| Job | `de6a1c93-4f1d-4803-ad7b-754a94862a1c` |
| Provider delay | 3000 ms |
| Invocation A | `b8b9e2d2-8c11-4c63-8b6e-7d7e3c9a1101` |
| Invocation B | `b8b9e2d2-8c11-4c63-8b6e-7d7e3c9a1102` |
| A observed status | PENDING |
| A outcome | COMPLETED |
| B observed status | COMPLETED |
| B outcome | ALREADY_COMPLETED |
| Final analyses | 3 |
| Final provider calls | 3 |
| Final invocations | 2 |
| Duplicate processing | Not observed |
| Genuine PROCESSING overlap | **Not established** |

### Why this is a limitation
The first invocation must remain actively executing while the second starts. The available TEST execution path serialized the two function calls sufficiently that B began after A's completion. The existing interrupt control cannot solve this because it ends A's invocation. Therefore the correct evidence-based classification is **HARNESS LIMITATION**, not concurrency-safe.

No repair or concurrency protection was introduced.


## PHASE 6C-8R — Overlap-Capability Investigation

Inspection of the live TEST reproduction functions shows:
- provider_delay_ms is an existing fixture control. The processor calls pg_sleep(delay) inside the same database function invocation/transaction after recording the provider call.
- interrupt_after_chunk is an existing early-return control. It records the chunk analysis and returns PROCESSING, ending the invocation; it does not keep a live processor executing.
- Invocation lifecycle is persisted in ils_test_judgment_repro_invocations: the processor inserts an invocation row at entry, records observed state, and sets ended_at/outcome before returning.
- The processor has no asynchronous/background worker, detached task, autonomous transaction, or internal concurrency orchestrator.
- Job state is persisted as PENDING/PROCESSING/WAITING/FAILED/COMPLETED, but PROCESSING is not an execution lease. There is no claim/lock/token mechanism in the reproduction semantics.
- Therefore the existing processor semantics can technically expose an overlap window via provider_delay_ms, provided two genuinely independent database sessions execute the function concurrently.
- The Phase 6C-8 orchestration path available here did not provide a reliable independent-session/concurrent execution primitive: the two calls were serialized and B started after A completed.
- Smallest semantics-neutral mechanism: a TEST-only orchestration runner using two independent DB connections/sessions, start invocation A, wait only until A is inside its existing provider-delay window, then issue invocation B on the second independent connection. No SQL/function/state-machine change is required. This is orchestration infrastructure only.
- Do not implement or run that mechanism in 6C-8R; this phase is investigation-only.

**Classification: A. EXISTING HARNESS CAN ESTABLISH GENUINE OVERLAP** at the processor/harness semantics level, but the currently available execution orchestration cannot reliably establish it. The prior 6C-8 result remains **HARNESS LIMITATION** and is not overwritten.
