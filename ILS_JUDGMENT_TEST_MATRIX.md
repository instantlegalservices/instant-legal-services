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