# ILS Reconciliation Matrix — Initial

| Area | MAIN | V9 | TEST | PRODUCTION | RELEASE/CURSOR | Status |
|---|---|---|---|---|---|---|
| Customer Action E2E | Test artifacts present | improved test artifacts | real gate GO | no production execution required | cursor invoke branch ahead 2 | VERIFIED |
| Document E2E | no native test runner in main | test branches | real evidence binding + GO | existing client document function | none merged | VERIFIED |
| Notification E2E | no genuine proof in main | test artifacts | function + HOLD | no dedicated notification Edge Function found in production list | none | HOLD |
| Professional Assignment | production architecture source exists | V9 differs materially | test architecture | production tables/functions | none merged | HOLD |
| Security E2E | hardened RLS source | V9 security/test artifacts | hostile/test registries | production RLS active | none merged | HOLD |
| Payment | existing Razorpay client | not to be blindly merged | synthetic UPI test stack | razorpay-payments + webhook active | none merged | HOLD |
| GST DRC-01C | no current-main GST source match | historical design/implementation not yet recovered in repo | native tables/migrations + authenticated intake bridge | no GST migrations/functions | none merged | HOLD |
| Judgment | public research pages + source files | release branch adds one process-summary file | test pipeline artifacts | 16 active functions include full judgment chain | release/g6 ahead 2 | PARTIALLY_VERIFIED |
| SEO | current generator/robots/sitemap | v9-final-test diverges by 146 ahead/101 behind | location test migrations | location registry foundation deployed | cursor/g1 ahead 5 | PARTIALLY_VERIFIED |
| Location/LGD | current location foundation | major V9 implementation | TEST location migrations | production location registry + redirects | multiple branches | HOLD |

## Branch facts
- main = 1dad0952bcddf5f4e5d09786cf688835ccda24c4
- v9-final-test = 3ae72f7574f57de2408fb0081ba5c7f7df09c755; diverged, 146 ahead / 101 behind main.
- release/g6-judgment-source-reconcile-20260925 = a7fb9c9bfd4707beedb3bb238d13762c5ba4b46d; ahead 2, adding only process-judgment-summary/index.ts.
- release/ils-write-test-20260925 = same SHA as main.
- cursor/customer-action-e2e-invoke-cb89 = bb7c593481ce52a81ce288385090a3ef78a71bb3; ahead 2 with customer-action invocation artifacts.
- cursor/g1-seo-indexability-cb89 = 1c57c0b4498f84aa049f5e0b2a24c1ec233ec2e9; ahead 5 with indexability/test artifacts and small private-route metadata changes.
- search-router-v1 = 2a13dcfcd253553896bbd8d9f55c4290233e5857; diverged, 1 ahead / 24 behind.

No branch was merged in Phase 0–3.

## Phase 4 update
| Area | Main | V9 | TEST | Production | Release/Cursor | Status |
|---|---|---|---|---|---|---|
| Judgment | active source/pipeline | release branch adds summary processing | test pipeline artifacts | 170 rows; 23 failed + 38 pending summaries; 13 pending text; 6 stale running fetch logs | release/g6 ahead 2 | DEFECT / UNVERIFIED |
| SEO | generator + robots/sitemap | materially divergent | location/SEO test artifacts | deployed runtime not yet independently swept | cursor/g1 ahead 5 | UNVERIFIED |
| Location/LGD | source architecture | substantial V9 work | registry table exists but 0 rows | registry exists but 0 rows | multiple branches | HOLD |
| Security | hardened RLS source | security/test artifacts | hostile infrastructure | 3 SECURITY DEFINER view errors + function/search_path warnings | none merged | HOLD |


## Phase 5 — Judgment + Security
| Area | Finding | Classification | Status |
|---|---|---|---|
| Judgment source | Summary processor exists on release/g6 branch, not main; Production runtime source could not be retrieved through current function-bundle interface | Source/runtime reconciliation gap | HOLD |
| Judgment retry | Retryable waiting exists, but no lease/stale recovery or concurrency lock in recovered processor | Design-level gap; Production runtime defect not proven | HOLD |
| Judgment production state | 170 rows; 13 pending text; 23 failed summaries; 38 pending summaries; 59 processing errors; 59 waiting jobs; 6 stale running fetch logs | Operationally unverified | HOLD |
| Advocate-directory views | Updatable/insertable Production views with broad anon/authenticated DML grants; underlying table has RLS | Configuration-gap candidate; exploit not reproduced | HOLD |
| SECURITY DEFINER functions | 3 anon-executable + 13 authenticated-executable Production functions; TEST lacks equivalent portal schema | TEST parity gap | HOLD |
| search_path | 4 Production advisor warnings; no faithful TEST equivalents | Configuration warning; impact unproven | HOLD |
| Leaked passwords | Production Auth protection disabled | Security configuration gap / human decision | HOLD |


## Phase 6C-6 — Fresh Judgment Baseline
| Area | TEST execution | Evidence | Status |
|---|---|---|---|
| Judgment reproduction harness | Fresh deterministic SUCCESS baseline completed after isolated alias repair | run `972efe78-5701-4cf4-abd9-95a8e11ea61a`; fixture `ffb64934-7a26-41bf-9062-62896258f687`; job `91ee7e18-7475-43bb-8e73-b1d8cab69bd5`; invocation `7b53dce0-b9c9-4b5f-ae9c-4d7d64c6e1c4` | PASS |
| Chunk processing | 3/3 chunks processed once | chunk IDs 0, 1, 2; 3 analyses; 3 SUCCESS provider calls | PASS |
| Summary completion | Final synthesis persisted | `DETERMINISTIC_FINAL_SYNTHESIS`; job next_chunk=3; status COMPLETED | PASS |
| Retry/failure path | Not exercised in 6C-6 | Reserved for subsequent controlled phase | NOT RUN |
| Concurrency/stale/idempotency | Not exercised in 6C-6 | Reserved for subsequent controlled phase | NOT RUN |


## Phase 6C-7 — Completed Job Repeat
| Area | Before | After | Result |
|---|---|---|---|
| Job status | COMPLETED | COMPLETED | No mutation |
| next_chunk | 3 | 3 | No mutation |
| Chunk analyses | 3 | 3 | No duplicate processing |
| Provider calls | 3 | 3 | No additional calls |
| Invocation count | 1 | 2 | Second invocation recorded |
| Retry count | 0 | 0 | No retry mutation |
| Final synthesis | DETERMINISTIC_FINAL_SYNTHESIS | unchanged | No duplicate synthesis |
| Classification | — | IDEMPOTENT / SAFE REPEAT | PASS for this scenario |

## Phase 6C-8 — Concurrency Reproduction
| Field | Observation | Classification |
|---|---|---|
| Fresh TEST run | `d054d451-290a-41ef-9168-064c8e7aa5d9` | Created once |
| Fixture | `a0d302f9-4e92-4da3-a531-3175ba8c48a9` | Created once |
| Job | `de6a1c93-4f1d-4803-ad7b-754a94862a1c` | Fresh |
| Invocation A | Completed all 3 chunks | No overlap proven |
| Invocation B | `ALREADY_COMPLETED` | Started after A completion |
| Analyses | 3 | No duplicate observed, but overlap not tested |
| Provider calls | 3 | All from A |
| Final status | COMPLETED | Normal completion |
| Concurrency classification | Genuine overlap not established | **HARNESS LIMITATION** |

The existing harness can delay provider work, but the available execution orchestration did not produce a transactionally overlapping invocation. Using `interrupt_after_chunk` would return the first invocation rather than keep it active, so it cannot by itself create the required overlap window. No function modification or locking/idempotency mechanism was added.


## Phase 6C-8R — Overlap Capability

| Capability | Finding |
|---|---|
| Provider delay | Existing provider_delay_ms calls pg_sleep inside the processor invocation/transaction |
| Persistent PROCESSING | Yes; processor sets job PROCESSING before chunk loop |
| Live invocation during delay | Yes, if the database call remains active in an independent session |
| Interrupt control | Returns the invocation; cannot itself create overlap |
| Background/asynchronous worker | None inside the harness |
| Invocation lifecycle | Persisted start/observation/end fields |
| Lock/lease/token | None by design |
| Current execution orchestrator | Did not provide reliable independent-session concurrency |
| Minimum safe mechanism | Two independent TEST DB sessions/connections, orchestration-only |
| Processor semantics change required? | No |

**6C-8R classification: EXISTING HARNESS CAN ESTABLISH GENUINE OVERLAP** in principle, using its existing provider-delay behavior and two independent DB sessions. The prior 6C-8 experiment remains classified **HARNESS LIMITATION** because that independent-session overlap was not actually established.



## Phase 6C-8O — Two-Session Execution Result

| Item | Result |
|---|---|
| Orchestrator artifact | Created on controlled branch |
| Orchestrator design | Two separately initiated TEST HTTP requests to existing processor |
| Fresh TEST fixture | Created once |
| Run | 4dc48cbe-eb14-43a7-b2a3-c64ab10e0e4a |
| Job | ca7cf286-3d95-48c6-b99b-57e2f456805d |
| Provider delay | 8000 ms |
| Pre-state | PENDING / 0 / 3 / 0 analyses / 0 provider calls / 0 invocations |
| Invocation A | Not executed |
| Invocation B | Not executed |
| Genuine overlap | Not demonstrated |
| Cause | External orchestration runtime could not resolve TEST Supabase hostname |
| Classification | HARNESS LIMITATION |

The experiment is fail-closed: no result about concurrency safety, duplication, or race behavior is claimed.
