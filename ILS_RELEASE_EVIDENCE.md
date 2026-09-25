# ILS Release Evidence

## Phase 0 — Environment Identity
- Repository: instantlegalservices/instant-legal-services
- Default branch: main
- Starting main SHA: 1dad0952bcddf5f4e5d09786cf688835ccda24c4
- Controlled working branch: cursor/ils-master-completion-20260925
- TEST Supabase: bgsbuepolooybdqrzmoa — ACTIVE_HEALTHY — ap-southeast-1
- Production Supabase: odqebkdzkjfxzyzbrndt — ACTIVE_HEALTHY — ap-southeast-1
- Production migrations currently listed: 16
- TEST migrations currently listed: 558
- No production mutation performed during Phase 0–3.

## Gate status at baseline
| Gate | Environment | Status | Evidence basis |
|---|---|---|---|
| CUSTOMER_ACTION_E2E | TEST | VERIFIED | Existing REAL_VERIFIED gate GO on 2026-09-23; authorization/audit evidence verified; production touch false. |
| DOCUMENT_E2E | TEST | VERIFIED | Existing release decision GO on 2026-09-23 with 1 genuine verified evidence item and 8 hostile tests passed; canonical real-evidence binding exists. |
| NOTIFICATION_E2E | TEST | HOLD | Latest release decision requires genuine verified evidence; current record shows 0 genuine verified evidence. |
| PROFESSIONAL_ASSIGNMENT_E2E | TEST | HOLD | Latest release decision requires genuine verified evidence; current record shows 0 genuine verified evidence. |
| SECURITY_EXECUTION_E2E | TEST | HOLD | Latest release decision requires genuine verified proof; current record shows 0 genuine verified evidence. |
| GST/GOV | TEST | HOLD | Native GST DRC-01C schema/functions exist in TEST, but no genuine E2E; latest harness run is synthetic-only BLOCKED. Production has no GST migrations/functions. |
| PAYMENT_E2E | PRODUCTION/TEST | HOLD | Existing payment chain located; genuine provider transaction evidence not yet verified. |
| JUDGMENT_PIPELINE | PRODUCTION | PARTIALLY_VERIFIED | Active fetch/process/summary pipeline exists; independent current E2E closure still required. |
| SEO_ROUTE_INTEGRITY | PRODUCTION | PARTIALLY_VERIFIED | Current main has route/generator/robots/sitemap; V9 branch diverges materially and is not merged. Full route sweep pending. |
| RELEASE_E2E | PRODUCTION | HOLD | Multiple required gates remain HOLD. |

## First executed safe verification action
DOCUMENT_E2E independent evidence reconciliation completed read-only against TEST.
- Canonical release decision: GO.
- Real evidence binding: DOCUMENT_E2E_REAL_V1.
- Function: ils-document-e2e-real v1.
- Authenticated test user bound in evidence: 82de1b27-5939-4f9e-bdce-313ed59ee7b1.
- Hostile results inspected: pass records present; no destructive attempts.
- Result: DOCUMENT_E2E remains VERIFIED under the existing gate contract.
- No schema, data, function, or production changes were made.

## Evidence limitations
A gate is not considered production-ready merely because an implementation exists. Payment, government, notification, professional-assignment, security, judgment, SEO and final release closure still require their own genuine evidence.

## Subsequent safe verification findings

### NOTIFICATION_E2E
- Existing TEST function: `ils-notification-e2e-real` v1, JWT required.
- It depends on external `RESEND_API_KEY` and is hard-bound to a TEST synthetic authenticated user.
- It sends to the provider's test recipient and records evidence as `UNVERIFIED`; therefore the current function cannot by itself close the release gate.
- Latest gate remains HOLD with 0 genuine verified evidence.
- No notification send was executed and no secret was requested/exposed.
- Classification: EXTERNAL DEPENDENCY + IMPLEMENTATION/EVIDENCE CONTRACT GAP; do not rewrite blindly.

### PROFESSIONAL_ASSIGNMENT_E2E
- TEST preflight is READY but explicitly disallows real professional identity, real assignment, real work offer and payout invocation.
- Latest gate remains HOLD with 0 genuine verified evidence.
- Synthetic run passed 9/10 steps but held the real-assignment boundary.
- Classification: genuine authenticated professional E2E dependency; no synthetic result may be promoted to VERIFIED.

### PAYMENT_E2E
- Production `razorpay-payments` v1 and `razorpay-webhook` v1 are active.
- Existing chain is preserved and no payment code was changed.
- Read-only inspection found no unique constraint on `payment_events`; webhook inserts an event before state updates and does not itself deduplicate event rows. This is a candidate replay/idempotency gap requiring TEST-only design/test before any production change.
- Provider secrets are server-side only; genuine Razorpay transaction evidence remains unavailable in the current tool context.
- Gate remains HOLD.

### GST/GOV
- TEST has native DRC-01C tables, migrations and authenticated intake bridge; current main has no corresponding GST source match and Production has no GST migrations.
- TEST migration history contains the GST case/intake, private storage, binding, promotion, lifecycle, audit, retention and authenticated intake work.
- TEST private bucket `ils-gst-drc01c-evidence` is non-public, 50 MiB limited, MIME restricted; authenticated case-scoped SELECT/INSERT policies are present.
- Native functions enforce auth.uid ownership, SHA-256 validation, size/MIME boundaries, duplicate/replay blocking, case/path binding and promotion gates.
- Latest GST harness run is synthetic-only BLOCKED at provenance; TEST case count is 0.
- Classification remains HOLD / existing partial implementation; no TEST→Production promotion.

## Current safe-work boundary
The next work requiring external/authenticated execution is genuine Notification/Professional/Payment/GST E2E. No credentials, secrets, production approval, or synthetic substitution will be invented.

## PHASE 4A — Judgment Deep Closure (2026-09-25)
- Production judgment rows: 170.
- `judgment_text_status`: completed 157, pending 13.
- `summary_status`: completed 109, failed 23, pending 38.
- `processing_error` is non-null on 59 rows.
- `judgment_fetch_logs`: 6 records remain `running`, all created 2026-08-23; this is stale-run evidence, not a current healthy-running state.
- A current 2026-09-25 verified judgment example has official `sci.gov.in` URLs, source hash, retrieved document text and `judgment_text_status=completed`, while summary is still pending.
- Therefore the pipeline exists and official provenance is present, but the current dataset has material failed/pending/stale states.
- No valid production judgment rows were changed.
- No blind merge of `release/g6-judgment-source-reconcile-20260925`.
- **Judgment classification: DEFECT/UNVERIFIED operational closure**, not a missing architecture. A safe fix must first be isolated to retry/stale-job handling or summary processing and tested in TEST.

## PHASE 4B — SEO Deep Closure
- Current main generator was inspected. It generates canonical tags and `index, follow` metadata for generated public pages and filters advocates to Approved + Public.
- The generator also contains a manually verified government-route registry and explicit official-source boundary.
- It is not sufficient evidence of complete route integrity: generator output does not by itself prove deployed sitemap/canonical/redirect/indexability consistency.
- V9 and cursor SEO branches remain materially divergent; no blind merge or wholesale regeneration performed.
- **SEO classification: UNVERIFIED**, with controlled route-manifest/deployed-runtime comparison still required.

## PHASE 4C — Location/LGD Deep Closure
- Production `location_registry` row count = 0.
- TEST `location_registry` row count = 0.
- Thus a populated stable-ID/LGD location registry is not currently evidenced by live database rows in either environment, despite historical/source architecture references.
- No duplicate-ID or duplicate-route rows can be demonstrated because the registries are empty.
- This is an evidence/integration gap, not grounds for replacing the architecture.
- **Location classification: HOLD / UNVERIFIED**.

## PHASE 4D — Production Security Deep Analysis
- The three Production advocate-directory views are owned by `postgres`, are non-RLS views, and use SECURITY DEFINER semantics; `approved_advocates_public` explicitly has `security_invoker=false`.
- The views expose only approved/public advocate profile columns, but database grants currently include broad DML privileges to `anon` and `authenticated` on the views. This is a **configuration-gap candidate** and requires TEST reproduction/updatability testing before any production change.
- Production security advisor reports:
  - 3 SECURITY DEFINER view errors.
  - 4 mutable-search_path warnings: `set_client_work_progress_updated_at`, `update_judgments_updated_at`, `search_judgments`, `update_judgment_sources_updated_at`.
  - 3 anon-executable SECURITY DEFINER functions: `get_client_assigned_advocate`, `get_client_portal`, `send_client_portal_message`.
  - 13 authenticated-executable SECURITY DEFINER functions, several intentionally used as admin/advocate/customer RPC boundaries.
  - leaked-password-protection disabled warning.
- No security changes were made. No privilege or RLS weakening occurred.
- **Security classification: HOLD / REQUIRES TEST**.

## PHASE 4E — Cross-Gate Dependency Reassessment
| Gate | Exact blocker | Type | Can progress without external credential? | Evidence required |
|---|---|---|---|---|
| Notification | genuine provider delivery evidence | external provider/configuration | No for final delivery closure | authenticated TEST send + provider delivery/status/retry evidence |
| Professional | genuine authenticated professional assignment/work | execution/identity | Partly | real TEST professional identity + authorization + assignment/work audit |
| Security | unresolved Production privilege/view/function warnings | security/configuration | Yes for analysis; final hostile E2E requires authenticated test contexts | TEST privilege/RLS hostile tests + exact remediation evidence |
| Payment | genuine provider transaction + webhook/replay evidence | external provider | No for final payment closure | Razorpay test transaction, signed webhook, duplicate/replay/failure evidence |
| GST/Gov | genuine GST DRC-01C E2E provenance | execution/integration | Partly; official submission remains external | authenticated TEST intake → evidence bind → promotion → downstream result/audit |
| Judgment | 23 failed + 38 pending summaries, 13 pending text, 6 stale running fetch logs | operational defect | Yes | TEST retry/stale handling verification + fresh pipeline evidence |
| SEO | deployed route/indexability consistency | verification | Yes | route sweep + sitemap/canonical/robots/redirect evidence |
| Location | empty live location registry | integration/evidence | Yes | source-to-DB/route reconciliation and duplicate/collision tests |


## Phase 5 — Judgment + Security execution
- Judgment source recovery: release/g6-judgment-source-reconcile-20260925 contains supabase/functions/process-judgment-summary/index.ts; current main does not contain that file, so the active summary implementation is not source-reconciled to main.
- The recovered summary function has retryable waiting behavior for model failures, but no database processing lease/lock and no stale-running recovery in the function itself. This is a design-level concurrency/idempotency gap in the unreleased branch, not proof that Production uses that exact code.
- Production read-only snapshot: 170 judgments; 157 text completed, 13 pending; 109 summaries completed, 23 failed, 38 pending; 59 rows with processing_error. judgment_summary_jobs: 94 completed, 59 waiting. judgment_fetch_logs: 12 total, 6 running, oldest records dated 2026-08-23. Cron instant-legal-judgment-auto-pipeline is active every 5 minutes and calls daily-judgment-pipeline.
- No Production judgment rows were changed. No TEST judgment fix was deployed because the authoritative TEST runtime does not expose the recovered Production judgment pipeline for genuine E2E reproduction, and no external AI credential was requested.

## Phase 5 Security execution
- TEST does not contain the Production advocate-directory views or Production portal SECURITY DEFINER functions, so the requested hostile invocations cannot be reproduced faithfully without inventing a parallel fixture. No such fixture was created.
- Production read-only inspection confirms all three advocate-directory views are owned by postgres, non-RLS, and reported is_updatable=YES and is_insertable_into=YES; anon and authenticated have broad DML grants. Underlying advocate_registrations has RLS with an admin ALL policy and a public registration INSERT policy. This is a real configuration-gap candidate, but no Production write/exploit was attempted.
- Production advisor scan at 2026-09-25T08:38Z: 3 SECURITY DEFINER view errors, 4 mutable-search_path warnings, 3 anon-executable SECURITY DEFINER functions, 13 authenticated-executable SECURITY DEFINER functions, and leaked-password protection disabled.
- No security migration, grant change, function change, view change, policy change, or authentication configuration change was made.


## PHASE 6C-6 — Fresh Deterministic Baseline Rerun (2026-09-25)
- Phase 6C-6R repair previously completed in TEST only: migration `phase_6c_6r_repair_judgment_repro_process_alias`, version `20260925085741`; Production/main/G6 untouched.
- Historical failed baseline preserved and not reused: run `153c7822-2e36-4f25-ad8e-c27ba11516af`.
- Fresh TEST run: `972efe78-5701-4cf4-abd9-95a8e11ea61a`.
- Fresh fixture: `ffb64934-7a26-41bf-9062-62896258f687`.
- Synthetic judgment: `d13680a4-f896-415d-ad4c-87f610250791`.
- Summary job: `91ee7e18-7475-43bb-8e73-b1d8cab69bd5`.
- Single processor invocation: `7b53dce0-b9c9-4b5f-ae9c-4d7d64c6e1c4`.
- Provider mode: SUCCESS; failures_before_success=0; exactly 3 deterministic chunks.
- Pre-state: PENDING, next_chunk=0, analyses=0, provider calls=0, invocations=0, retry_count=0, final_summary=NULL, next_retry_at=NULL.
- Post-state: COMPLETED, next_chunk=3, exactly 3 chunk analyses, exactly 3 SUCCESS provider calls, exactly 1 invocation, retry_count=0, next_retry_at=NULL, final_summary=`DETERMINISTIC_FINAL_SYNTHESIS`.
- Actual observed execution evidence: invocation observed the initial PENDING/next_chunk=0; provider calls were recorded once each for chunks 0, 1 and 2; analyses were recorded once each for chunks 0, 1 and 2; judgment reached COMPLETED.
- Data integrity: one fixture, one judgment, one job for the fresh run; no duplicate analyses/provider calls/invocations and no cross-fixture records observed.
- State reconstruction from persisted evidence: PENDING (invocation observation) → PROCESSING (processor transition) → chunk 0 → chunk 1 → chunk 2 → final synthesis → COMPLETED.
- **PHASE 6C-6 FRESH BASELINE = PASS.**
- Advanced tests were not executed in this step.


## PHASE 6C-7 — Repeated Invocation / Idempotency
- Existing completed baseline job was reinvoked exactly once without changing the job/fixture first.
- Run: `972efe78-5701-4cf4-abd9-95a8e11ea61a`; fixture: `ffb64934-7a26-41bf-9062-62896258f687`; judgment: `d13680a4-f896-415d-ad4c-87f610250791`; job: `91ee7e18-7475-43bb-8e73-b1d8cab69bd5`.
- Pre-state: COMPLETED, next_chunk=3, retry_count=0, 3 analyses, 3 provider calls, 1 invocation, final summary present, next_retry_at=NULL.
- Reinvocation: `c8e40f12-0d4b-4a6a-9dd0-7b6c4c5f8e21`; processor returned `COMPLETED / ALREADY_COMPLETED`.
- Post-state: COMPLETED, next_chunk=3, retry_count=0, 3 analyses, 3 provider calls, 2 invocations, same final summary, next_retry_at=NULL.
- Counts before→after: analyses 3→3; provider calls 3→3; invocations 1→2; retry_count 0→0; next_chunk 3→3. Job status remained COMPLETED and final synthesis remained unchanged.
- Classification: **IDEMPOTENT / SAFE REPEAT** for this completed-job repeat scenario. The processor records the second invocation but performs no chunk/provider/final-synthesis mutation.
- No advanced concurrency/stale/recovery/retry/timeout tests were run.

## PHASE 6C-8 — Overlapping Processor Concurrency Reproduction
- Fresh TEST run: `d054d451-290a-41ef-9168-064c8e7aa5d9`; fixture: `a0d302f9-4e92-4da3-a531-3175ba8c48a9`; judgment: `df1c6e92-4335-4799-837f-4f0043a727ea`; job: `de6a1c93-4f1d-4803-ad7b-754a94862a1c`.
- Pre-state: PENDING, next_chunk=0, 3 chunks, 0 analyses, 0 provider calls, 0 invocations, retry_count=0, final_summary=NULL, next_retry_at=NULL.
- Provider delay was set to 3000ms solely using the existing fixture control; no processor semantics were changed.
- Two invocation requests were issued concurrently at the tool orchestration layer, but genuine database-level overlap was NOT established. Invocation A ran from 09:04:59.639648Z to the same timestamp in its recorded invocation row and ultimately completed all 3 chunks; invocation B began at 09:05:10.554010Z and observed COMPLETED/next_chunk=3, returning ALREADY_COMPLETED.
- Final job evidence: COMPLETED, next_chunk=3, 3 analyses, 3 provider calls, 2 invocation records, retry_count=0, final synthesis present. Provider calls all belong to invocation A, chunks 0/1/2 once each.
- Because invocation B did not execute while A was in PROCESSING, this run cannot establish concurrency safety or concurrency duplication.
- **Classification: HARNESS LIMITATION — genuine overlap could not be established without changing the reproduction semantics.** No remediation or additional concurrency mechanism was introduced.
- No further Phase 6C advanced tests were executed.


## PHASE 6C-8O — Two-Session Genuine Overlap Execution

- TEST-only orchestration artifact created: tests/phase-6c-8o-two-session.mjs.
- Artifact is orchestration-only: it calls the existing processor through two separately initiated HTTP requests, with an explicit delay before B; it adds no processor protection or state-machine behavior.
- Fresh TEST run/fixture was created for the intended execution: run 4dc48cbe-eb14-43a7-b2a3-c64ab10e0e4a; fixture ba913b3e-f282-40a7-a6cb-5d31007dad2c; judgment d0209932-8453-4544-816c-de39fae126a8; job ca7cf286-3d95-48c6-b99b-57e2f456805d; 3 chunks; deterministic SUCCESS; provider delay 8000ms.
- Pre-execution state remained PENDING, next_chunk=0, analyses=0, provider calls=0, invocations=0, retry_count=0, final synthesis=NULL.
- The available execution environment could not resolve the TEST Supabase hostname from the external orchestration runtime. Consequently neither processor invocation A nor B was executed through the two-session runner.
- Genuine temporal overlap was NOT demonstrated. No concurrency result was inferred.
- PHASE 6C-8O = HARNESS LIMITATION.
- No processor semantics, concurrency protection, retry behavior, provider behavior, Production, main, or G6 were changed.



## PHASE 6C-8F — FINAL JUDGMENT CONCURRENCY BLOCKER FREEZE

**JUDGMENT_CONCURRENCY = UNVERIFIED / EXECUTION-ENVIRONMENT BLOCKED**

Formal freeze:
1. Normal single execution is verified by Phase 6C-6.
2. Repeated invocation after COMPLETED is verified idempotent by Phase 6C-7.
3. Genuine active-job concurrency remains unverified.
4. Existing processor/harness semantics contain a possible overlap window through provider_delay_ms.
5. The available execution environment could not establish two independent live TEST sessions.
6. Phase 6C-8O therefore remains HARNESS LIMITATION.
7. No Production concurrency remediation has been authorized or performed.

Release blocker: **JUDGMENT CONCURRENCY EVIDENCE = OPEN / UNVERIFIED**.

This finding is deliberately NOT classified as concurrency safe, concurrency unsafe, race condition, or duplication defect. No further concurrency experiment was run; no new fixture was created; no processor, Production, main, or G6 changes were made.
